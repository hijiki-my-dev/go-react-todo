import axios, { type InternalAxiosRequestConfig } from 'axios'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'

// 401後の再送かどうかを記録するため、リクエスト設定にフラグを足した型
type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean }
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
})

// Todo APIへのリクエストにログイン中のユーザーのIDトークンを付ける
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser

  if (!user) {
    throw new Error('ログインが必要です')
  }

  const token = await user.getIdToken()
  config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

// 401（トークン期限切れ・失効など）が返ったときの処理
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetryableConfig | undefined
    const user = auth.currentUser

    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !config || !user) {
      return Promise.reject(error)
    }

    // 1回目の401: トークンを強制更新して1度だけ再送する
    if (!config._retried) {
      config._retried = true
      try {
        const token = await user.getIdToken(true)
        config.headers.set('Authorization', `Bearer ${token}`)
        return api.request(config)
      } catch {
        // 更新自体に失敗した場合（アカウント無効化など）は下でログアウト
      }
    }

    // 再送しても401、または更新失敗: ログアウトし、ProtectedRouteがログイン画面へ戻す
    await signOut(auth).catch(() => {})
    return Promise.reject(error)
  },
)

// APIエラーを画面に出すメッセージに変換する。レート制限・件数上限は理由を伝え、それ以外は既定の文言を使う
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 429) return '操作が多すぎます。少し待ってからお試しください。'
    if (error.response?.status === 409) return 'タスクは1人500件までです。不要なタスクを削除してから追加してください。'
  }
  return fallback
}
