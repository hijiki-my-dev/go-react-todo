package main

import (
	"encoding/json"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"io"
	"log"
	"net/http"
	"strconv"
)

// Todoの形式を定義
type Todo struct {
	ID    uint   `json:"id"    gorm:"primaryKey"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

type Handler struct {
	db *gorm.DB
}

// ハンドラーを定義
func (h *Handler) getTop(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "Hello World!")
}

// 引数はお決まりのテンプレート
// レシーバを活用することで、ハンドラーと紐づいた関数となる
func (h *Handler) createTodo(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}

	// データ受信・例外処理
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	// todoを追加
	todo := Todo{Title: body.Title, Done: false}
	err := gorm.G[Todo](h.db).Create(r.Context(), &todo)
	if err != nil {
		writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJson(w, http.StatusCreated, todo)
}

func (h *Handler) getTodos(w http.ResponseWriter, r *http.Request) {
	todos, err := gorm.G[Todo](h.db).Find(r.Context())
	if err != nil {
		writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJson(w, http.StatusOK, todos)
}

func (h *Handler) getTodo(w http.ResponseWriter, r *http.Request) {
	// stringで受け取ったidをuintにキャスト
	idStr := r.PathValue("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	id := uint(id64)

	// todoを取り出す
	todo, err := gorm.G[Todo](h.db).Where("id = ?", id).First(r.Context())
	if err != nil {
		writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJson(w, http.StatusOK, todo)
}

func (h *Handler) updateTodo(w http.ResponseWriter, r *http.Request) {
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
		_, err = gorm.G[Todo](h.db).Where("id = ?", id).Update(r.Context(), "Title", *body.Title)
		if err != nil {
			writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}
	if body.Done != nil {
		_, err = gorm.G[Todo](h.db).Where("id = ?", id).Update(r.Context(), "Done", *body.Done)
		if err != nil {
			writeJson(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}

	todo, err := gorm.G[Todo](h.db).Where("id = ?", id).First(r.Context())
	if err != nil {
		writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJson(w, http.StatusOK, todo)
}

func (h *Handler) deleteTodo(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	id := uint(id64)

	rowsAffected, err := gorm.G[Todo](h.db).Where("id = ?", id).Delete(r.Context())
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

func main() {
	log.Println("Hello Logging!")

	// DBマイグレーション
	dsn := "host=todo-db user=todo_user password=postgres dbname=todo port=5432 sslmode=disable TimeZone=Asia/Tokyo"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database: ", err)
	}
	h := &Handler{db: db}
	h.db.AutoMigrate(&Todo{})

	// サーバー起動
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", h.getTop)
	mux.HandleFunc("GET /todos", h.getTodos)
	mux.HandleFunc("GET /todos/{id}", h.getTodo)
	mux.HandleFunc("POST /todos", h.createTodo)
	mux.HandleFunc("PATCH /todos/{id}", h.updateTodo)
	mux.HandleFunc("DELETE /todos/{id}", h.deleteTodo)
	http.ListenAndServe(":8080", mux)
}
