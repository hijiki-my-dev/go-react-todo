// 同じタブ内での連続操作を抑える簡易制限。サーバー側の認証制限ではない。
export const LOGIN_WINDOW_MS = 60_000
export const MAX_LOGIN_ATTEMPTS = 5
const STORAGE_KEY = 'todo.loginAttempts'
let memoryAttempts: number[] = []

export function getLoginAttempts(now = Date.now()): number[] {
  let attempts: unknown = memoryAttempts
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored !== null) attempts = JSON.parse(stored)
  } catch {
    // ストレージが使用できない場合も、このページ内では制限を続ける
  }
  return (Array.isArray(attempts) ? attempts : []).filter(
    (time): time is number => typeof time === 'number' &&
      Number.isFinite(time) && time > now - LOGIN_WINDOW_MS && time <= now,
  ).sort((a, b) => a - b)
}

export function recordLoginAttempt(now = Date.now()): number | null {
  const attempts = getLoginAttempts(now)
  if (attempts.length >= MAX_LOGIN_ATTEMPTS) {
    return attempts[attempts.length - MAX_LOGIN_ATTEMPTS] + LOGIN_WINDOW_MS
  }
  memoryAttempts = [...attempts, now]
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryAttempts))
  } catch {
    // メモリ上の履歴を使用する
  }
  return null
}

export function getLoginBlockedUntil(now = Date.now()): number {
  const attempts = getLoginAttempts(now)
  return attempts.length >= MAX_LOGIN_ATTEMPTS
    ? attempts[attempts.length - MAX_LOGIN_ATTEMPTS] + LOGIN_WINDOW_MS
    : 0
}
