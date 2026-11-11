import { useEffect, useState } from 'react'
import { api } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import { TrashIcon, UndoIcon } from '../components/icons'
import { shortDateLabel } from '../lib/date'
import { kindLabels, type Todo } from '../types/todo'

const outlineButton =
  'inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-lg text-slate-600 hover:bg-slate-100 md:h-8 md:w-auto md:border md:border-slate-200 md:bg-white md:px-2.5 md:text-[13px]'
const dangerButton =
  'inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-lg text-red-700 hover:bg-red-50 md:h-8 md:w-auto md:border md:border-red-200 md:bg-white md:px-2.5 md:text-[13px]'

type Confirm = { kind: 'one'; todo: Todo } | { kind: 'all' }

// メイン画面から削除したタスク。復元するか完全に削除できる
function Trash() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  useEffect(() => {
    api.get<Todo[]>('/todos/trash')
      .then((response) => setTodos(response.data))
      .catch((err) => {
        console.error('データ取得エラー:', err)
        setError('ゴミ箱の取得に失敗しました。再読み込みしてください。')
      })
      .finally(() => setLoading(false))
  }, [])

  async function restore(id: number) {
    setError('')
    try {
      await api.post(`/todos/${id}/restore`)
      setTodos((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      console.error('復元エラー:', err)
      setError('タスクを復元できませんでした。')
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
        await api.delete('/todos/trash')
        setTodos([])
      }
    } catch (err) {
      console.error('削除エラー:', err)
      setError('削除に失敗しました。')
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">ゴミ箱</h1>
          <p className="mt-1 text-sm text-slate-500">メイン画面から削除したタスクです。復元するか、完全に削除できます。</p>
        </div>
        {todos.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirm({ kind: 'all' })}
            className="h-10 rounded-lg border border-red-200 bg-white px-3 text-[13px] text-red-700 hover:bg-red-50 md:h-8"
          >
            ゴミ箱を空にする
          </button>
        )}
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中...</p>
      ) : todos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <TrashIcon size={36} strokeWidth={1.5} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">ゴミ箱は空です</p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-slate-200 bg-white p-1 md:p-2">
          {todos.map((todo) => (
            <li key={todo.id} className="flex min-h-14 items-center gap-1 rounded-xl px-2 hover:bg-slate-50 md:min-h-0 md:gap-2 md:py-1.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-1 md:flex-row md:items-center md:gap-3">
                <span className="min-w-0 flex-1 break-words text-[15px] text-slate-700 md:text-sm">{todo.title}</span>
                <span className="text-xs whitespace-nowrap text-slate-500">
                  {kindLabels[todo.kind]}
                  {todo.deletedAt && ` ・ ${shortDateLabel(todo.deletedAt)} 削除`}
                </span>
              </div>
              <button type="button" onClick={() => restore(todo.id)} aria-label={`「${todo.title}」を復元`} className={outlineButton}>
                <UndoIcon size={16} />
                <span className="hidden md:inline">復元</span>
              </button>
              <button type="button" onClick={() => setConfirm({ kind: 'one', todo })} aria-label={`「${todo.title}」を完全に削除`} className={dangerButton}>
                <TrashIcon size={16} />
                <span className="hidden md:inline">完全に削除</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'one' ? `「${confirm.todo.title}」を完全に削除しますか？` : `ゴミ箱の ${todos.length} 件をすべて削除しますか？`}
          confirmLabel="削除する"
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

export default Trash
