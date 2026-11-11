import { useEffect, useState } from 'react'
import { api } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import { CheckedCircleIcon, TrashIcon, UndoIcon } from '../components/icons'
import { groupByDay, timeLabel } from '../lib/date'
import type { Todo } from '../types/todo'

const outlineButton =
  'inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-lg text-slate-600 hover:bg-slate-100 md:h-8 md:w-auto md:border md:border-slate-200 md:bg-white md:px-2.5 md:text-[13px]'
const dangerButton =
  'inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-lg text-red-700 hover:bg-red-50 md:h-8 md:w-auto md:border md:border-red-200 md:bg-white md:px-2.5 md:text-[13px]'

type Confirm = { kind: 'one'; todo: Todo } | { kind: 'all' }

// 完了したタスクの一覧。ここで削除すると完全に消える
function Completed() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  useEffect(() => {
    api.get<Todo[]>('/todos')
      .then((response) => {
        const done = response.data.filter((t) => t.kind === 'single' && t.done)
        done.sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
        setTodos(done)
      })
      .catch((err) => {
        console.error('データ取得エラー:', err)
        setError('完了タスクの取得に失敗しました。再読み込みしてください。')
      })
      .finally(() => setLoading(false))
  }, [])

  async function undo(id: number) {
    setError('')
    try {
      await api.patch(`/todos/${id}`, { done: false })
      setTodos((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      console.error('更新エラー:', err)
      setError('タスクを戻せませんでした。')
    }
  }

  async function runConfirm() {
    if (!confirm) return
    const target = confirm
    setConfirm(null)
    setError('')
    try {
      if (target.kind === 'one') {
        await api.delete(`/todos/${target.todo.id}`, { params: { permanent: true } })
        setTodos((prev) => prev.filter((t) => t.id !== target.todo.id))
      } else {
        await api.delete('/todos/completed')
        setTodos([])
      }
    } catch (err) {
      console.error('削除エラー:', err)
      setError('削除に失敗しました。')
    }
  }

  const groups = groupByDay(todos, (t) => t.doneAt ?? new Date(0).toISOString())

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">完了タスク</h1>
          <p className="mt-1 text-sm text-slate-500">
            完了にしたタスクはここに移動します。ここで削除すると元に戻せません。
          </p>
        </div>
        {todos.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirm({ kind: 'all' })}
            className="h-10 rounded-lg border border-red-200 bg-white px-3 text-[13px] text-red-700 hover:bg-red-50 md:h-8"
          >
            すべて削除
          </button>
        )}
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中...</p>
      ) : todos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-700">完了したタスクはまだありません</p>
          <p className="text-[13px] text-slate-500">メイン画面でタスクを完了にすると、ここに表示されます。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="px-1 pb-2 text-xs font-semibold text-slate-500">{group.label}</h2>
              <ul className="rounded-2xl border border-slate-200 bg-white p-1 md:p-2">
                {group.items.map((todo) => (
                  <li key={todo.id} className="flex min-h-14 items-center gap-1 rounded-xl px-2 hover:bg-slate-50 md:min-h-0 md:gap-2 md:py-1.5">
                    <CheckedCircleIcon size={21} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-1 md:flex-row md:items-center md:gap-3">
                      <span className="min-w-0 flex-1 break-words text-[15px] text-slate-500 line-through md:text-sm">
                        {todo.title}
                      </span>
                      {todo.doneAt && <span className="text-xs whitespace-nowrap text-slate-500">{timeLabel(todo.doneAt)} 完了</span>}
                    </div>
                    <button type="button" onClick={() => undo(todo.id)} aria-label={`「${todo.title}」を未完了に戻す`} className={outlineButton}>
                      <UndoIcon size={16} />
                      <span className="hidden md:inline">戻す</span>
                    </button>
                    <button type="button" onClick={() => setConfirm({ kind: 'one', todo })} aria-label={`「${todo.title}」を完全に削除`} className={dangerButton}>
                      <TrashIcon size={16} />
                      <span className="hidden md:inline">削除</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'one' ? `「${confirm.todo.title}」を完全に削除しますか？` : `完了タスク ${todos.length} 件をすべて削除しますか？`}
          confirmLabel="削除する"
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

export default Completed
