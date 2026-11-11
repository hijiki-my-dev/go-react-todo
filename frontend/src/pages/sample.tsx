import { Link } from 'react-router'
import TaskBoard from '../components/TaskBoard'
import { InfoIcon, LogoMark } from '../components/icons'
import { APP_TITLE } from '../constants'
import { useSampleTodos } from '../hooks/useSampleTodos'

// ログイン不要のお試しページ。サーバーには保存しない
function Sample() {
  const model = useSampleTodos()
  const completedCount = model.todos.filter((t) => t.kind === 'single' && t.done).length

  return (
    <div className="min-h-dvh pb-28 md:pb-12">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-10">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="hidden text-base font-bold sm:inline">{APP_TITLE}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">サンプル</span>
        </div>
        <Link
          to="/login"
          className="inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 md:h-9"
        >
          ログインして使う
        </Link>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pt-4 md:gap-6 md:px-10 md:pt-6">
        <div role="note" className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <InfoIcon size={20} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-amber-950">これはお試し用のサンプルです</p>
            <p className="mt-0.5 text-[13px] text-amber-900">
              ログインなしでタスクを追加・並び替え・完了できますが、データはサーバーに保存されません。ページを閉じると消えます。
            </p>
          </div>
          <button
            type="button"
            onClick={model.reset}
            className="h-10 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-[13px] text-amber-950 hover:bg-amber-100 md:h-8"
          >
            初期状態に戻す
          </button>
        </div>

        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">サンプル</h1>
        <TaskBoard model={model} addPlaceholder="試しにタスクを追加してみましょう…" />
        {completedCount > 0 && (
          <p className="text-[13px] text-slate-500">
            完了したタスク: {completedCount} 件（ログインすると「完了タスク」ページで確認できます）
          </p>
        )}
      </main>
    </div>
  )
}

export default Sample
