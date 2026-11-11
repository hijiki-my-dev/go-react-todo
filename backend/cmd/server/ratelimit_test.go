package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func requestAs(uid string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/todos", nil)
	return r.WithContext(context.WithValue(r.Context(), userIDContextKey, uid))
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func TestRateLimitMiddleware(t *testing.T) {
	h := &Handler{userLimiter: newKeyedLimiter(userRateLimit, userRateBurst)}
	handler := h.rateLimitMiddleware(okHandler())

	// 連続で許可される回数（バースト）までは通る
	for i := 0; i < userRateBurst; i++ {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, requestAs("alice"))
		if w.Code != http.StatusOK {
			t.Fatalf("request %d: got %d, want 200", i+1, w.Code)
		}
	}

	// それを超えると429とRetry-Afterが返る
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, requestAs("alice"))
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("over limit: got %d, want 429", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Fatal("Retry-After header is missing")
	}

	// 別のユーザーは影響を受けない
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, requestAs("bob"))
	if w.Code != http.StatusOK {
		t.Fatalf("other user: got %d, want 200", w.Code)
	}
}

func requestFrom(xff, authHeader string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/todos", nil)
	if xff != "" {
		r.Header.Set("X-Forwarded-For", xff)
	}
	if authHeader != "" {
		r.Header.Set("Authorization", authHeader)
	}
	return r
}

func TestAuthFailureLimit(t *testing.T) {
	// authClientはnil。ブロック中にトークン検証まで進むとpanicするので、検証前に断っていることも確かめられる
	h := &Handler{authFailLimiter: newKeyedLimiter(authFailRateLimit, authFailBurst)}
	handler := h.authMiddleware(okHandler())

	// 上限までは通常どおり401
	for i := 0; i < authFailBurst; i++ {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, requestFrom("203.0.113.1", ""))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d: got %d, want 401", i+1, w.Code)
		}
	}

	// 上限を超えると、トークンを付けていても検証せずに429
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, requestFrom("203.0.113.1", "Bearer some-token"))
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("blocked ip: got %d, want 429", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Fatal("Retry-After header is missing")
	}

	// X-Forwarded-Forの先頭を偽装しても、末尾のIPで判定されるので逃れられない
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, requestFrom("198.51.100.7, 203.0.113.1", ""))
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("spoofed xff: got %d, want 429", w.Code)
	}

	// 別のIPは影響を受けない
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, requestFrom("203.0.113.2", ""))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("other ip: got %d, want 401", w.Code)
	}
}

func TestClientIP(t *testing.T) {
	tests := []struct {
		name       string
		xff        []string
		remoteAddr string
		want       string
	}{
		{"xffの末尾を使う", []string{"198.51.100.7, 203.0.113.1"}, "10.0.0.1:1234", "203.0.113.1"},
		{"xffが1つだけ", []string{"203.0.113.1"}, "10.0.0.1:1234", "203.0.113.1"},
		{"複数ヘッダーなら最後のヘッダー", []string{"198.51.100.7", "203.0.113.1"}, "10.0.0.1:1234", "203.0.113.1"},
		{"xffなしは接続元", nil, "192.0.2.5:4321", "192.0.2.5"},
		{"xffが不正なら接続元", []string{"not-an-ip"}, "192.0.2.5:4321", "192.0.2.5"},
		{"IPv6は/64にまとめる", []string{"2001:db8:1:2:aaaa::1"}, "10.0.0.1:1234", "2001:db8:1:2::/64"},
		{"IPv4射影アドレスはIPv4として扱う", []string{"::ffff:203.0.113.1"}, "10.0.0.1:1234", "203.0.113.1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/todos", nil)
			r.RemoteAddr = tt.remoteAddr
			for _, v := range tt.xff {
				r.Header.Add("X-Forwarded-For", v)
			}
			if got := clientIP(r); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}
