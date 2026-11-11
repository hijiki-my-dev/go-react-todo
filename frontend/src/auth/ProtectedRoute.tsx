import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthContext'

// ログインしていないと入れないページをまとめて守るレイアウトルート
function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  // 確認中に判定するとログイン済みでも一瞬ログインページに飛ばされるので待つ
  if (loading) {
    return <p>読み込み中...</p>
  }

  if (!user) {
    // ログイン後に元のページへ戻れるよう、今いた場所を state で渡す
    // replace: 履歴を置き換えて「戻る」ボタンでここに戻ってこないようにする
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // ログイン済みなら子ルート（Home など）をここに描画する
  return <Outlet />
}

export default ProtectedRoute
