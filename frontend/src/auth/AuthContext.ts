import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

// アプリ全体で共有する認証状態の型
export type AuthState = {
  // ログイン中のユーザー。未ログインなら null
  user: User | null
  // Firebaseがログイン状態を確認中なら true（起動直後は必ず true）
  loading: boolean
}

// Context本体。Provider の外で使われたときのために初期値を入れておく
export const AuthContext = createContext<AuthState>({ user: null, loading: true })

// コンポーネントから認証状態を取り出すためのカスタムフック
export function useAuth() {
  return useContext(AuthContext)
}
