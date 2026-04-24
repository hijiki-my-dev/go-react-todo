# インメモリDBとしてスライスを使った場合の記録

スライスの使い方などが今後の参考になりそうなので残してます。

## 実行方法
backend/ に移動した後
```
go run cmd/server/main.go
```
起動したサーバーへの接続方法
```
# 一覧取得
curl http://localhost:8080/todos

# 作成
curl -X POST http://localhost:8080/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "散歩する"}'

# 編集
curl -X PATCH http://localhost:8080/todo/2 \
  -H "Content-Type: application/json" \
  -d '{"title": "新しいタイトル", "done": true}'

# 削除
curl -X DELETE http://localhost:8080/todo/2

# 個別取得
curl http://localhost:8080/todos/1
```