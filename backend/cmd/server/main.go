package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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
	{ID: 2, Title: "Goを勉強する", Done: true},
}

// インデックス
var nextID int = 3

// ハンドラーを定義
func getTopHandler(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "Hello World!")
}

func getTodosHandler(w http.ResponseWriter, r *http.Request) {
	// io.WriteString(w, "Get todos")
	writeJson(w, http.StatusOK, todos)

}

// Json形式でレスポンスを定義する
func writeJson(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func main() {
	fmt.Println("Hello World!")
	log.Println("Hello Logging!")

	// サーバー起動
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", getTopHandler)
	mux.HandleFunc("GET /todos", getTodosHandler)
	http.ListenAndServe(":8080", mux)
}
