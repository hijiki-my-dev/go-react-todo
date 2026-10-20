import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, type Location } from 'react-router'
import { FirebaseError } from 'firebase/app'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../auth/AuthContext'
import { getLoginBlockedUntil, recordLoginAttempt } from '../auth/loginRateLimit'

function loginErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'ログインがキャンセルされました。もう一度お試しください。'
      case 'auth/popup-blocked':
        return 'ポップアップがブロックされました。ブラウザで許可してからお試しください。'
      case 'auth/network-request-failed':
        return '通信に失敗しました。接続を確認してからお試しください。'
      case 'auth/too-many-requests':
        return 'ログイン要求が多すぎます。しばらく待ってからお試しください。'
      case 'auth/user-disabled':
        return 'このアカウントは無効になっています。'
      case 'auth/unauthorized-domain':
      case 'auth/operation-not-allowed':
        return 'ログインの設定に問題があります。管理者にお問い合わせください。'
    }
  }
  return 'ログインに失敗しました。もう一度お試しください。'
}

function Login() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/'
  const [isSigningIn, setIsSigningIn] = useState(false)
  const signingIn = useRef(false)
  const [error, setError] = useState('')
  const [blockedUntil, setBlockedUntil] = useState(getLoginBlockedUntil)
  const [now, setNow] = useState(Date.now)
  const remainingSeconds = Math.max(0, Math.ceil((blockedUntil - now) / 1000))

  useEffect(() => {
    if (!blockedUntil) return
    const timer = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= blockedUntil) setBlockedUntil(0)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [blockedUntil])

  async function handleGoogleLogin() {
    // stateの再描画前に続けて呼ばれても二重実行しない
    if (signingIn.current) return
    const time = Date.now()
    const retryAt = recordLoginAttempt(time)
    setNow(time)
    if (retryAt !== null) {
      setBlockedUntil(retryAt)
      return
    }

    signingIn.current = true
    setIsSigningIn(true)
    setError('')
    setBlockedUntil(getLoginBlockedUntil(time))
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      // AuthProviderがuserを更新するとNavigateで遷移する
    } catch (error) {
      setError(loginErrorMessage(error))
    } finally {
      signingIn.current = false
      setIsSigningIn(false)
    }
  }

  if (loading) return <p>読み込み中...</p>
  if (user) return <Navigate to={from} replace />

  return (
    <section id="center">
      <h1>ログイン</h1>
      {error && <p role="alert">{error}</p>}
      {remainingSeconds > 0 && (
        <p role="status">ログインは60秒間に5回までです。あと{remainingSeconds}秒で再試行できます。</p>
      )}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isSigningIn || remainingSeconds > 0}
        aria-busy={isSigningIn}
      >
        {isSigningIn ? 'ログイン中...' : 'Googleでログイン'}
      </button>
    </section>
  )
}

export default Login
