package main

import (
	"context"
	"encoding/json"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
	"unicode/utf8"
)

// Todoの種類。single: 個別タスク、weekly/monthly: 定期タスク
const (
	KindSingle  = "single"
	KindWeekly  = "weekly"
	KindMonthly = "monthly"
)

func isValidKind(kind string) bool {
	return kind == KindSingle || kind == KindWeekly || kind == KindMonthly
}

// 1ユーザーが持てるTodoの最大件数（完了済み・未完了・定期タスクをすべて含む）
const maxTodosPerUser = 500

// タイトルの最大文字数（フロントのmaxLengthと揃える）
const maxTitleLength = 200

// リクエストボディの最大サイズ。Todo APIのボディは小さいので64KBあれば十分
const maxBodyBytes = 64 << 10

// タイトルが空でなく、上限文字数以内かを確認する
func isValidTitle(title string) bool {
	if strings.TrimSpace(title) == "" {
		return false
	}
	return utf8.RuneCountInString(title) <= maxTitleLength
}

// 巨大なリクエストボディでメモリを使い切られないよう、読み取るサイズを制限する
func bodyLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		next.ServeHTTP(w, r)
	})
}

// Todoの形式を定義
type Todo struct {
	ID       uint       `json:"id"    gorm:"primaryKey"`
	UserID   string     `json:"-" gorm:"index;not null"`
	Title    string     `json:"title"`
	Done     bool       `json:"done"`
	Kind     string     `json:"kind" gorm:"not null;default:single"`
	Position int        `json:"position" gorm:"not null;default:0"`
	DoneAt   *time.Time `json:"doneAt"`
}

type Handler struct {
	db              *gorm.DB
	authClient      *auth.Client
	userLimiter     *keyedLimiter // 認証済みユーザーごとのリクエスト数の制限
	authFailLimiter *keyedLimiter // IPごとの認証失敗回数の制限
}

type contextKey string

const userIDContextKey contextKey = "userID"

// リクエストコンテキストから認証済みのUIDを取り出す
func userIDFromContext(ctx context.Context) (string, bool) {
	uid, ok := ctx.Value(userIDContextKey).(string)
	return uid, ok
}

// Authorizationヘッダーのトークンを検証し、UIDをコンテキストに詰める
func (h *Handler) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 認証に失敗し続けているIPは、トークンを検証する前に断る（検証のCPUを使わせない）
		ip := clientIP(r)
		if h.authFailLimiter.blocked(ip) {
			w.Header().Set("Retry-After", authFailRetrySec)
			writeJson(w, http.StatusTooManyRequests, map[string]string{"error": "too many requests"})
			return
		}

		authHeader := r.Header.Get("Authorization")
		token, found := strings.CutPrefix(authHeader, "Bearer ")
		if !found || token == "" {
			h.recordAuthFailure(r, ip, "missing token")
			writeJson(w, http.StatusUnauthorized, map[string]string{"error": "missing bearer token"})
			return
		}

		decoded, err := h.authClient.VerifyIDToken(r.Context(), token)
		if err != nil {
			h.recordAuthFailure(r, ip, "invalid token")
			writeJson(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			return
		}

		ctx := context.WithValue(r.Context(), userIDContextKey, decoded.UID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ハンドラーを定義
func (h *Handler) getTop(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "Hello World!")
}

// 引数はお決まりのテンプレート
// レシーバを活用することで、ハンドラーと紐づいた関数となる
func (h *Handler) createTodo(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	var body struct {
		Title string `json:"title"`
		Kind  string `json:"kind"`
	}

	// データ受信・例外処理
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	if !isValidTitle(body.Title) {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid title"})
		return
	}
	if body.Kind == "" {
		body.Kind = KindSingle
	}
	if !isValidKind(body.Kind) {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid kind"})
		return
	}

	// 件数チェック・末尾の位置の計算・追加を1つのSQLで行い、DBとの往復を1回にする
	// 件数が上限以上ならHAVINGで行が消え、何も追加されない
	// （上限は悪用防止の目安なので、同時リクエストでわずかに超えることは許容する）
	var todo Todo
	result := h.db.WithContext(r.Context()).Raw(`
		INSERT INTO todos (user_id, title, done, kind, position)
		SELECT ?, ?, false, ?, COALESCE(MAX(position), -1) + 1
		FROM todos WHERE user_id = ?
		HAVING COUNT(*) < ?
		RETURNING *`,
		uid, body.Title, body.Kind, uid, maxTodosPerUser,
	).Scan(&todo)
	if result.Error != nil {
		writeInternalError(w, r, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		writeJson(w, http.StatusConflict, map[string]string{"error": "Todo list is full."})
		return
	}
	writeJson(w, http.StatusCreated, todo)
}

func (h *Handler) getTodos(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	todos, err := gorm.G[Todo](h.db).Where("user_id = ?", uid).Order("position, id").Find(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJson(w, http.StatusOK, todos)
}

func (h *Handler) getTodo(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	// stringで受け取ったidをuintにキャスト
	idStr := r.PathValue("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	id := uint(id64)

	// todoを取り出す
	todo, err := gorm.G[Todo](h.db).Where("id = ? AND user_id = ?", id, uid).First(r.Context())
	if err != nil {
		writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJson(w, http.StatusOK, todo)
}

func (h *Handler) updateTodo(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	// titleとdoneの片方だけが来た場合でも機能させたい。
	// ポインタを設定することで、ポインタがnilかどうかで変数の存在確認を行うことができる
	var body struct {
		Title *string `json:"title"`
		Done  *bool   `json:"done"`
	}

	// データ受信・例外処理
	err := json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	idStr := r.PathValue("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	id := uint(id64)

	if body.Title != nil && !isValidTitle(*body.Title) {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid title"})
		return
	}
	// 変更する列をまとめ、1回のUPDATEで更新後の行も受け取る（DBとの往復を1回にする）
	updates := map[string]any{}
	if body.Title != nil {
		updates["title"] = *body.Title
	}
	if body.Done != nil {
		// 完了にした日時を記録する。定期タスクは「今週/今月に完了したか」の判定に使う
		var doneAt *time.Time
		if *body.Done {
			now := time.Now()
			doneAt = &now
		}
		updates["done"] = *body.Done
		updates["done_at"] = doneAt
	}

	// 変更がなければ現在の値を返すだけ
	if len(updates) == 0 {
		todo, err := gorm.G[Todo](h.db).Where("id = ? AND user_id = ?", id, uid).First(r.Context())
		if err != nil {
			writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJson(w, http.StatusOK, todo)
		return
	}

	var todo Todo
	result := h.db.WithContext(r.Context()).Model(&todo).Clauses(clause.Returning{}).
		Where("id = ? AND user_id = ?", id, uid).Updates(updates)
	if result.Error != nil {
		writeInternalError(w, r, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJson(w, http.StatusOK, todo)
}

// パスの{id}をuintに変換する
func parseID(r *http.Request) (uint, bool) {
	id64, err := strconv.ParseUint(r.PathValue("id"), 10, 64)
	if err != nil {
		return 0, false
	}
	return uint(id64), true
}

func (h *Handler) deleteTodo(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	id, ok := parseID(r)
	if !ok {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	result := h.db.WithContext(r.Context()).Where("id = ? AND user_id = ?", id, uid).Delete(&Todo{})
	if result.Error != nil {
		writeInternalError(w, r, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// 完了済みの個別タスクをすべて削除する
func (h *Handler) deleteCompleted(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	err := h.db.WithContext(r.Context()).
		Where("user_id = ? AND kind = ? AND done = ?", uid, KindSingle, true).Delete(&Todo{}).Error
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// 並び順を保存する。受け取ったIDの順番でpositionを振り直す
func (h *Handler) reorderTodos(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	var body struct {
		IDs []uint `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.IDs) > maxTodosPerUser {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	err := h.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		for i, id := range body.IDs {
			err := tx.Model(&Todo{}).Where("id = ? AND user_id = ?", id, uid).Update("position", i).Error
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Json形式でレスポンスを定義する
func writeJson(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// 内部エラーの詳細はサーバーログにだけ出し、クライアントには汎用メッセージを返す
func writeInternalError(w http.ResponseWriter, r *http.Request, err error) {
	log.Printf("internal error: %s %s: %v", r.Method, r.URL.Path, err)
	writeJson(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
}

// フロントとの接続用
func corsMiddleware(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	log.Println("Hello Logging!")

	godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// DBマイグレーション
	// dsn := "host=todo-db user=todo_user password=postgres dbname=todo port=5432 sslmode=disable TimeZone=Asia/Tokyo"
	dsn := os.Getenv("DATABASE_URL")
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database: ", err)
	}

	// Firebase Admin SDKの初期化
	// ローカルでは.envのGOOGLE_APPLICATION_CREDENTIALSで指定した鍵ファイル、
	// Cloud Runでは紐付いたサービスアカウントの認証情報が自動的に使われる(ADC)
	// IDトークンの検証に必要なのはプロジェクトIDのみ。本番ではGOOGLE_CLOUD_PROJECTで明示する
	ctx := context.Background()
	firebaseApp, err := firebase.NewApp(ctx, nil)
	if err != nil {
		log.Fatal("failed to initialize firebase app: ", err)
	}
	authClient, err := firebaseApp.Auth(ctx)
	if err != nil {
		log.Fatal("failed to initialize firebase auth client: ", err)
	}

	h := &Handler{
		db:              db,
		authClient:      authClient,
		userLimiter:     newKeyedLimiter(userRateLimit, userRateBurst),
		authFailLimiter: newKeyedLimiter(authFailRateLimit, authFailBurst),
	}
	// マイグレーションに失敗したまま起動すると全APIが500になるため、ここで止める
	if err := h.db.AutoMigrate(&Todo{}); err != nil {
		log.Fatal("failed to migrate database: ", err)
	}
	corsOrigin := os.Getenv("CORS_ORIGIN")

	// サーバー起動
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", h.getTop)
	// 認証とユーザーごとのレート制限をかけたハンドラーにする
	protected := func(f http.HandlerFunc) http.Handler {
		return h.authMiddleware(h.rateLimitMiddleware(f))
	}
	mux.Handle("GET /todos", protected(h.getTodos))
	mux.Handle("GET /todos/{id}", protected(h.getTodo))
	mux.Handle("POST /todos", protected(h.createTodo))
	mux.Handle("PATCH /todos/{id}", protected(h.updateTodo))
	mux.Handle("PUT /todos/order", protected(h.reorderTodos))
	mux.Handle("DELETE /todos/{id}", protected(h.deleteTodo))
	mux.Handle("DELETE /todos/completed", protected(h.deleteCompleted))
	// 遅いクライアントに接続を占有され続けないよう、各種タイムアウトを設定する
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           corsMiddleware(corsOrigin, bodyLimitMiddleware(mux)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil {
		log.Fatal("server stopped: ", err)
	}
}
