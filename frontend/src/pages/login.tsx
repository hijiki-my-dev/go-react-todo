import { Navigate, useLocation, type Location } from 'react-router'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../auth/AuthContext'

function Login() {
  const { user, loading } = useAuth()
  const location = useLocation()
  // ProtectedRoute から渡された「元いたページ」。直接 /login に来た場合は "/"
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/'

  function handleGoogleLogin() {
    signInWithPopup(auth, new GoogleAuthProvider())
      .catch(error => {
        console.error('ログインエラー:', error)
      })
    // 成功時は onAuthStateChanged が user を更新し、下の Navigate で遷移する
  }

  if (loading) {
    return <p>読み込み中...</p>
  }

  // ログイン済みならログインページは不要なので元のページへ
  if (user) {
    return <Navigate to={from} replace />
  }

  return (
    <section id="center">
      <h1>ログイン</h1>
      <button type="button" onClick={handleGoogleLogin}>Googleでログイン</button>
    </section>
  )
}

export default Login
