package main

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ユーザーごとのレート制限の設定
// 平均2回/秒まで、連続では最大30回まで許可する。人の操作では超えず、スクリプトによる連打だけを止める
const (
	userRateLimit     rate.Limit = 2
	userRateBurst                = 30
	limiterIdleTTL               = 10 * time.Minute
	rateLimitRetrySec            = "1"
)

// UIDごとのトークンバケットをメモリ上で管理する
//
// 注意: カウンタはインスタンスごとのメモリにあるため、Cloud Runの最大インスタンス数が1であることを前提にしている。
// インスタンスを増やす場合は、実質的な上限がインスタンス数倍になるので、共有ストアを使う方式に見直すこと。
type userRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*limiterEntry
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newUserRateLimiter() *userRateLimiter {
	l := &userRateLimiter{limiters: map[string]*limiterEntry{}}
	go l.cleanupLoop()
	return l
}

// このユーザーのリクエストを今処理してよいかを返す
func (l *userRateLimiter) allow(uid string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	e, ok := l.limiters[uid]
	if !ok {
		e = &limiterEntry{limiter: rate.NewLimiter(userRateLimit, userRateBurst)}
		l.limiters[uid] = e
	}
	e.lastSeen = time.Now()
	return e.limiter.Allow()
}

// しばらくアクセスのないユーザーの記録を消し、メモリが増え続けないようにする
// （10分あればバケットは満タンに戻っているので、消しても制限が緩くなることはない）
func (l *userRateLimiter) cleanupLoop() {
	ticker := time.NewTicker(limiterIdleTTL)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-limiterIdleTTL)
		l.mu.Lock()
		for uid, e := range l.limiters {
			if e.lastSeen.Before(cutoff) {
				delete(l.limiters, uid)
			}
		}
		l.mu.Unlock()
	}
}

// 認証済みユーザーのリクエスト数を制限する。authMiddlewareの内側で使う
func (h *Handler) rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, _ := userIDFromContext(r.Context())
		if !h.rateLimiter.allow(uid) {
			w.Header().Set("Retry-After", rateLimitRetrySec)
			writeJson(w, http.StatusTooManyRequests, map[string]string{"error": "too many requests"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
