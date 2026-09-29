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
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
)

// Todoの形式を定義
type Todo struct {
	ID     uint   `json:"id"    gorm:"primaryKey"`
	UserID string `json:"-" gorm:"index;not null"`
	Title  string `json:"title"`
	Done   bool   `json:"done"`
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

	todos, err := gorm.G[Todo](h.db).Where("user_id = ?", uid).Find(r.Context())
	if len(todos) > 200 {
		writeJson(w, http.StatusInternalServerError, map[string]string{"error": "Todo list is full."})
		return
	}
	var body struct {
		Title string `json:"title"`
	}

	// データ受信・例外処理
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	// todoを追加
	todo := Todo{UserID: uid, Title: body.Title, Done: false}
	err = gorm.G[Todo](h.db).Create(r.Context(), &todo)
	if err != nil {
		writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJson(w, http.StatusCreated, todo)
}

func (h *Handler) getTodos(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	todos, err := gorm.G[Todo](h.db).Where("user_id = ?", uid).Find(r.Context())
	if err != nil {
		writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
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

	if body.Title != nil {
		_, err = gorm.G[Todo](h.db).Where("id = ? AND user_id = ?", id, uid).Update(r.Context(), "Title", *body.Title)
		if err != nil {
			writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}
	if body.Done != nil {
		_, err = gorm.G[Todo](h.db).Where("id = ? AND user_id = ?", id, uid).Update(r.Context(), "Done", *body.Done)
		if err != nil {
			writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
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

func (h *Handler) deleteTodo(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFromContext(r.Context())

	idStr := r.PathValue("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	id := uint(id64)

	rowsAffected, err := gorm.G[Todo](h.db).Where("id = ? AND user_id = ?", id, uid).Delete(r.Context())
	if err != nil {
		writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if rowsAffected == 0 {
		writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
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

// フロントとの接続用
func corsMiddleware(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
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
	h.db.AutoMigrate(&Todo{})

	corsOrigin := os.Getenv("CORS_ORIGIN")

	// サーバー起動
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", h.getTop)
	mux.Handle("GET /todos", h.authMiddleware(http.HandlerFunc(h.getTodos)))
	mux.Handle("GET /todos/{id}", h.authMiddleware(http.HandlerFunc(h.getTodo)))
	mux.Handle("POST /todos", h.authMiddleware(http.HandlerFunc(h.createTodo)))
	mux.Handle("PATCH /todos/{id}", h.authMiddleware(http.HandlerFunc(h.updateTodo)))
	mux.Handle("DELETE /todos/{id}", h.authMiddleware(http.HandlerFunc(h.deleteTodo)))
	http.ListenAndServe(":"+port, corsMiddleware(corsOrigin, mux))
}
