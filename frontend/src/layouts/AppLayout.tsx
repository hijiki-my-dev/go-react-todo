import { useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../auth/AuthContext'
import { CheckCircleIcon, FlaskIcon, ListIcon, LogoMark, LogoutIcon, TrashIcon } from '../components/icons'
import { APP_TITLE } from '../constants'

type NavItem = { to: string; label: string; shortLabel: string; icon: ReactNode }

const navItems: NavItem[] = [
  { to: '/', label: 'メイン', shortLabel: 'メイン', icon: <ListIcon /> },
  { to: '/completed', label: '完了タスク', shortLabel: '完了', icon: <CheckCircleIcon /> },
  { to: '/trash', label: 'ゴミ箱', shortLabel: 'ゴミ箱', icon: <TrashIcon /> },
]

// ログイン後の画面で共通のレイアウト（PC: 左サイドバー / スマホ: 下部タブ）
function AppLayout() {
  const { user } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const signingOut = useRef(false)

  async function handleLogout() {
    if (signingOut.current) return
    signingOut.current = true
    setIsSigningOut(true)
    setLogoutError('')
    try {
      await signOut(auth)
      // ProtectedRouteが未ログイン状態を検知してログイン画面へ戻す
    } catch {
      setLogoutError('ログアウトに失敗しました。もう一度お試しください。')
    } finally {
      signingOut.current = false
      setIsSigningOut(false)
    }
  }

  const userName = user?.displayName ?? user?.email ?? ''
  const initial = userName.slice(0, 1).toUpperCase() || '?'

  const logoutButton = (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSigningOut}
      aria-busy={isSigningOut}
      aria-label={isSigningOut ? 'ログアウト中' : 'ログアウト'}
      title="ログアウト"
      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
    >
      <LogoutIcon />
    </button>
  )

  return (
    <div className="min-h-dvh md:flex">
      {/* PC: サイドバー */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-slate-200 bg-slate-100 px-3 py-5 md:sticky md:top-0 md:flex md:h-dvh">
        <div className="flex items-center gap-2.5 px-3 pb-5">
          <LogoMark />
          <span className="text-base font-bold">{APP_TITLE}</span>
        </div>
        <nav aria-label="メインメニュー" className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <div className="mx-2 my-3 h-px bg-slate-200" />
          <NavLink
            to="/sample"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 hover:text-slate-900"
          >
            <FlaskIcon />
            サンプル
          </NavLink>
        </nav>
        <div className="flex-1" />
        <div className="mt-3 flex items-center gap-2.5 border-t border-slate-200 px-3 pt-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-sm font-semibold text-indigo-800"
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{userName}</span>
          {logoutButton}
        </div>
        {logoutError && <p role="alert" className="px-3 text-xs text-red-700">{logoutError}</p>}
      </aside>

      {/* スマホ: 上部バー */}
      <header className="flex items-center justify-between px-4 pt-3 md:hidden">
        <div className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-sm font-bold">{APP_TITLE}</span>
        </div>
        {logoutButton}
      </header>
      {logoutError && <p role="alert" className="px-4 text-xs text-red-700 md:hidden">{logoutError}</p>}

      <main className="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-10 md:pt-8 md:pb-12">
        <Outlet />
      </main>

      {/* スマホ: 下部タブ */}
      <nav
        aria-label="メインメニュー"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
                isActive ? 'font-semibold text-indigo-600' : 'text-slate-500'
              }`
            }
          >
            {item.icon}
            {item.shortLabel}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default AppLayout
