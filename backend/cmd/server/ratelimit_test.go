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

func TestRateLimitMiddleware(t *testing.T) {
	h := &Handler{rateLimiter: &userRateLimiter{limiters: map[string]*limiterEntry{}}}
	handler := h.rateLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

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
