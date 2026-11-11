# 第一ステージ
FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/server

# 第二ステージ
FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/main .

# root権限で動かさないよう、専用の一般ユーザーで実行する
RUN adduser -D -H -u 10001 appuser
USER appuser

CMD ["./main"]
