package main

import (
	"encoding/json"
	// "fmt"
	"io"
	"log"
	"net/http"
	"strconv"
)

// Todoの形式を定義
type Todo struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

// とりあえず配列でDBを表現
var todos = []Todo{
	{ID: 1, Title: "牛乳を買う", Done: false},
	{ID: 2, Title: "Goを勉強する", Done: false},
}

// インデックス
var nextID int = 3

// ハンドラーを定義
func getTopHandler(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "Hello World!")
}

func createTodoHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}

	// データ受信・例外処理
	err := json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		writeJson(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	// todoを追加
	todo := Todo{ID: nextID, Title: body.Title, Done: false}
	nextID++
	todos = append(todos, todo)
	writeJson(w, http.StatusCreated, todo)
}

func getTodosHandler(w http.ResponseWriter, r *http.Request) {
	writeJson(w, http.StatusOK, todos)
}

func getTodoHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, t := range todos {
		if strconv.Itoa(t.ID) == id {
			writeJson(w, http.StatusOK, t)
			return
		}
	}
	writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func updateTodoHandler(w http.ResponseWriter, r *http.Request) {
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

	id := r.PathValue("id")
	for i, t := range todos {
		if strconv.Itoa(t.ID) == id {
			if body.Title != nil {
				todos[i].Title = *body.Title
			}
			if body.Done != nil {
				todos[i].Done = *body.Done
			}
			writeJson(w, http.StatusOK, t)
			return
		}
	}
	writeJson(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

// Json形式でレスポンスを定義する
func writeJson(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func main() {
	log.Println("Hello Logging!")

	// サーバー起動
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", getTopHandler)
	mux.HandleFunc("GET /todos", getTodosHandler)
	mux.HandleFunc("GET /todo/{id}", getTodoHandler)
	mux.HandleFunc("POST /todos", createTodoHandler)
	mux.HandleFunc("PATCH /todo/{id}", updateTodoHandler)
	http.ListenAndServe(":8080", mux)
}
