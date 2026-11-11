package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
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

// 1ユーザーが持てるTodoの最大件数
const maxTodosPerUser = 200

var errTodoLimitReached = errors.New("todo limit reached")

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
	db         *gorm.DB
	authClient *auth.Client
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
		authHeader := r.Header.Get("Authorization")
		token, found := strings.CutPrefix(authHeader, "Bearer ")
		if !found || token == "" {
			writeJson(w, http.StatusUnauthorized, map[string]string{"error": "missing bearer token"})
			return
		}

		decoded, err := h.authClient.VerifyIDToken(r.Context(), token)
		if err != nil {
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

	todo := Todo{UserID: uid, Title: body.Title, Done: false, Kind: body.Kind}
	err := h.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		// 同じユーザーの作成リクエストを1件ずつ処理し、同時リクエストで上限を超えないようにする
		// （ロックはトランザクション終了時に自動で解放される）
		if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtext(?))", uid).Error; err != nil {
			return err
		}

		var stats struct {
			Count  int64
			MaxPos *int
		}
		err := tx.Model(&Todo{}).Select("COUNT(*) AS count, MAX(position) AS max_pos").
			Where("user_id = ?", uid).Scan(&stats).Error
		if err != nil {
			return err
		}
		if stats.Count >= maxTodosPerUser {
			return errTodoLimitReached
		}

		// 新しいTodoは一覧の末尾に追加する
		if stats.MaxPos != nil {
			todo.Position = *stats.MaxPos + 1
		}
		return tx.Create(&todo).Error
	})
	if errors.Is(err, errTodoLimitReached) {
		writeJson(w, http.StatusConflict, map[string]string{"error": "Todo list is full."})
		return
	}
	if err != nil {
		writeInternalError(w, r, err)
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
	if body.Title != nil {
		_, err = gorm.G[Todo](h.db).Where("id = ? AND user_id = ?", id, uid).Update(r.Context(), "Title", *body.Title)
		if err != nil {
			writeInternalError(w, r, err)
			return
		}
	}
	if body.Done != nil {
		// 完了にした日時を記録する。定期タスクは「今週/今月に完了したか」の判定に使う
		var doneAt *time.Time
		if *body.Done {
			now := time.Now()
			doneAt = &now
		}
		err = h.db.WithContext(r.Context()).Model(&Todo{}).
			Where("id = ? AND user_id = ?", id, uid).
			Updates(map[string]any{"done": *body.Done, "done_at": doneAt}).Error
		if err != nil {
			writeInternalError(w, r, err)
			return
		}
	}

	todo, err := gorm.G[Todo](h.db).Where("id = ? AND user_id = ?", id, uid).First(r.Context())
	if err != nil {
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.IDs) > 500 {
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

	h := &Handler{db: db, authClient: authClient}
	// マイグレーションに失敗したまま起動すると全APIが500になるため、ここで止める
	if err := h.db.AutoMigrate(&Todo{}); err != nil {
		log.Fatal("failed to migrate database: ", err)
	}
	// ゴミ箱機能の廃止に伴い、ゴミ箱に残っていたTodoを削除してから列を消す
	// （列を残したままだと論理削除済みのTodoが一覧に戻ってきてしまう）
	if h.db.Migrator().HasColumn(&Todo{}, "deleted_at") {
		err := h.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec("DELETE FROM todos WHERE deleted_at IS NOT NULL").Error; err != nil {
				return err
			}
			return tx.Migrator().DropColumn(&Todo{}, "deleted_at")
		})
		if err != nil {
			log.Fatal("failed to drop deleted_at column: ", err)
		}
	}

	corsOrigin := os.Getenv("CORS_ORIGIN")

	// サーバー起動
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", h.getTop)
	mux.Handle("GET /todos", h.authMiddleware(http.HandlerFunc(h.getTodos)))
	mux.Handle("GET /todos/{id}", h.authMiddleware(http.HandlerFunc(h.getTodo)))
	mux.Handle("POST /todos", h.authMiddleware(http.HandlerFunc(h.createTodo)))
	mux.Handle("PATCH /todos/{id}", h.authMiddleware(http.HandlerFunc(h.updateTodo)))
	mux.Handle("PUT /todos/order", h.authMiddleware(http.HandlerFunc(h.reorderTodos)))
	mux.Handle("DELETE /todos/{id}", h.authMiddleware(http.HandlerFunc(h.deleteTodo)))
	mux.Handle("DELETE /todos/completed", h.authMiddleware(http.HandlerFunc(h.deleteCompleted)))
	http.ListenAndServe(":"+port, corsMiddleware(corsOrigin, bodyLimitMiddleware(mux)))
}
