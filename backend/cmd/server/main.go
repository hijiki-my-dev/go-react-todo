package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
)

// ハンドラーを定義
func getTopHandler(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "Hello World!")
}

func getTodosHandler(w http.ResponseWriter, r *http.Request) {
	io.WriteString(w, "Get todos")
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
