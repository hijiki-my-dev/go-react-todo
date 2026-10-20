import axios from 'axios'
import { auth } from './firebase'

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
