package main

import (
	"log"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ユーザーごとのレート制限の設定
// 平均2回/秒まで、連続では最大30回まで許可する。人の操作では超えず、スクリプトによる連打だけを止める
const (
	userRateLimit    rate.Limit = 2
	userRateBurst               = 30
	userRateRetrySec            = "1"
	limiterIdleTTL              = 10 * time.Minute
)

// IPごとの認証失敗の制限の設定
// 連続10回まで失敗でき、その後は6秒に1回ずつ回復する（平均10回/分）
// 正常なユーザーはトークン期限切れ時の再送で1〜2回失敗する程度なので、まず引っかからない
var authFailRateLimit = rate.Every(6 * time.Second)

const (
	authFailBurst    = 10
	authFailRetrySec = "10"
)

// キー（UIDやIP）ごとのトークンバケットをメモリ上で管理する
//
// 注意: カウンタはインスタンスごとのメモリにあるため、Cloud Runの最大インスタンス数が1であることを前提にしている。
// インスタンスを増やす場合は、実質的な上限がインスタンス数倍になるので、共有ストアを使う方式に見直すこと。
type keyedLimiter struct {
	mu       sync.Mutex
	limiters map[string]*limiterEntry
	limit    rate.Limit
	burst    int
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newKeyedLimiter(limit rate.Limit, burst int) *keyedLimiter {
	l := &keyedLimiter{limiters: map[string]*limiterEntry{}, limit: limit, burst: burst}
	go l.cleanupLoop()
	return l
}

// トークンを1つ使い、使えた（上限内だった）かを返す
func (l *keyedLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	e, ok := l.limiters[key]
	if !ok {
		e = &limiterEntry{limiter: rate.NewLimiter(l.limit, l.burst)}
		l.limiters[key] = e
	}
	e.lastSeen = time.Now()
	return e.limiter.Allow()
}

// トークンを使わずに、今が上限に達した状態かどうかだけを返す
func (l *keyedLimiter) blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	e, ok := l.limiters[key]
	return ok && e.limiter.Tokens() < 1
}

// しばらくアクセスのないキーの記録を消し、メモリが増え続けないようにする
// （10分あればバケットは満タンに戻っているので、消しても制限が緩くなることはない）
func (l *keyedLimiter) cleanupLoop() {
	ticker := time.NewTicker(limiterIdleTTL)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-limiterIdleTTL)
		l.mu.Lock()
		for key, e := range l.limiters {
			if e.lastSeen.Before(cutoff) {
				delete(l.limiters, key)
			}
		}
		l.mu.Unlock()
	}
}

// 認証済みユーザーのリクエスト数を制限する。authMiddlewareの内側で使う
func (h *Handler) rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, _ := userIDFromContext(r.Context())
		if !h.userLimiter.allow(uid) {
			w.Header().Set("Retry-After", userRateRetrySec)
			writeJson(w, http.StatusTooManyRequests, map[string]string{"error": "too many requests"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// 認証の失敗をIPごとに記録し、ログに残す
func (h *Handler) recordAuthFailure(r *http.Request, ip, reason string) {
	h.authFailLimiter.allow(ip)
	log.Printf("auth failed: ip=%s reason=%s path=%s", ip, reason, r.URL.Path)
}

// レート制限に使うクライアントのIPを返す
//
// Cloud Runでは、Googleのフロントエンドが接続元のIPをX-Forwarded-Forの末尾に追加する。
// 先頭側はクライアントが自由に書けて偽装できるため、末尾の値を使う。
// ロードバランサーを前段に置く場合は末尾がLBのIPになるので、取り出す位置を見直すこと。
// ヘッダーがない場合（ローカル環境など）は接続元のアドレスを使う。
func clientIP(r *http.Request) string {
	if values := r.Header.Values("X-Forwarded-For"); len(values) > 0 {
		parts := strings.Split(values[len(values)-1], ",")
		if addr, err := netip.ParseAddr(strings.TrimSpace(parts[len(parts)-1])); err == nil {
			return rateLimitKey(addr)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		return rateLimitKey(addr)
	}
	return host
}

// IPv6は1人が/64の範囲のアドレスを自由に使えるため、/64単位でまとめて数える
func rateLimitKey(addr netip.Addr) string {
	addr = addr.Unmap()
	if addr.Is4() {
		return addr.String()
	}
	return netip.PrefixFrom(addr, 64).Masked().String()
}
