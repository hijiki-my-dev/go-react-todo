import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, type Location } from 'react-router'
import { FirebaseError } from 'firebase/app'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../auth/AuthContext'
import { getLoginBlockedUntil, recordLoginAttempt } from '../auth/loginRateLimit'
import { ArrowRightIcon, LogoMark } from '../components/icons'
import { APP_TITLE } from '../constants'

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

  if (loading) return <p className="py-20 text-center text-sm text-slate-500">読み込み中...</p>
  if (user) return <Navigate to={from} replace />

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-10 pb-10 md:items-center md:justify-center md:px-4">
      <main className="flex w-full flex-1 flex-col gap-6 md:max-w-[400px] md:flex-none md:items-center">
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-center md:flex-none">
          <LogoMark size={60} />
          <h1 className="mt-1 text-[26px] font-bold">{APP_TITLE}</h1>
          <p className="text-sm leading-relaxed text-slate-500">
            毎日のタスクと、週・月ごとの定期タスクを
            <br className="md:hidden" />
            ひとつの画面で。
          </p>
        </div>

        <div className="flex w-full flex-col gap-3.5 md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-7 md:shadow-sm">
          <h2 className="hidden text-center text-base font-semibold md:block">ログイン</h2>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800">{error}</p>}
          {remainingSeconds > 0 && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
              ログインは60秒間に5回までです。あと{remainingSeconds}秒で再試行できます。
            </p>
          )}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isSigningIn || remainingSeconds > 0}
            aria-busy={isSigningIn}
            className="flex h-[52px] items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white text-base font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50 md:h-12 md:text-[15px]"
          >
            <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full border-[1.5px] border-slate-500 text-[11px] font-bold text-slate-700">G</span>
            {isSigningIn ? 'ログイン中...' : 'Googleでログイン'}
          </button>
        </div>

        <Link
          to="/sample"
          className="inline-flex h-12 items-center justify-center gap-1.5 text-[15px] font-semibold text-indigo-600 hover:text-indigo-800 md:h-auto md:text-sm"
        >
          ログインせずにサンプルを試す
          <ArrowRightIcon size={16} />
        </Link>
      </main>
    </div>
  )
}

export default Login
