import { useState, type FormEvent } from 'react'
import { kindLabels, type TodoKind } from '../types/todo'
import { PlusIcon } from './icons'

const kinds: TodoKind[] = ['single', 'weekly', 'monthly']

type AddTaskProps = {
  onAdd: (title: string, kind: TodoKind) => Promise<boolean>
  placeholder?: string
}

function KindPicker({ kind, onChange, name }: { kind: TodoKind; onChange: (k: TodoKind) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label="種類" className="flex flex-1 rounded-lg bg-slate-100 p-[3px] md:flex-none">
      {kinds.map((k) => (
        <label
          key={k}
          className={`flex h-9 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-[13px] has-focus-visible:ring-2 has-focus-visible:ring-indigo-300 md:h-[30px] ${
            kind === k ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={k}
            checked={kind === k}
            onChange={() => onChange(k)}
            className="sr-only"
          />
          {kindLabels[k]}
        </label>
      ))}
    </div>
  )
}

// タスク追加フォーム（PC: 画面上部 / スマホ: 右下のボタンから開くシート）
function AddTask({ onAdd, placeholder = '新しいタスクを追加…' }: AddTaskProps) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TodoKind>('single')
  const [submitting, setSubmitting] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = title.trim()
    if (trimmed === '' || submitting) return
    setSubmitting(true)
    const ok = await onAdd(trimmed, kind)
    setSubmitting(false)
    if (ok) {
      setTitle('')
      setSheetOpen(false)
    }
  }

  const submitButton = (
    <button
      type="submit"
      disabled={submitting || title.trim() === ''}
      className="h-11 shrink-0 rounded-lg bg-indigo-600 px-5 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 md:h-9 md:px-4 md:text-sm"
    >
      追加
    </button>
  )

  return (
    <>
      {/* PC */}
      <form
        onSubmit={handleSubmit}
        className="hidden flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white pr-2 md:flex"
      >
        <label className="flex min-w-[240px] flex-1 items-center pl-4">
          <span className="sr-only">新しいタスク</span>
          <input
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={placeholder}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />
        </label>
        <div className="flex items-center gap-2 py-1.5">
          <KindPicker kind={kind} onChange={setKind} name="kind-pc" />
          {submitButton}
        </div>
      </form>

      {/* スマホ */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="タスクを追加"
        className="fixed right-5 bottom-[88px] z-20 flex size-14 items-center justify-center rounded-[18px] bg-indigo-600 text-white shadow-lg shadow-indigo-600/35 md:hidden"
      >
        <PlusIcon size={24} strokeWidth={2.2} />
      </button>
      {sheetOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-slate-900/35"
          />
          <form
            onSubmit={handleSubmit}
            role="dialog"
            aria-label="タスクを追加"
            className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-3xl bg-white px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+24px)]"
          >
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
              新しいタスク
              <input
                autoFocus
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={placeholder}
                className="h-12 rounded-xl border border-slate-300 px-3.5 text-base font-normal text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <div className="flex items-center gap-2">
              <KindPicker kind={kind} onChange={setKind} name="kind-sp" />
              {submitButton}
            </div>
          </form>
        </div>
      )}
    </>
  )
}

export default AddTask
