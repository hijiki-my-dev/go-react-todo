import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { isPendingTodo, type Todo } from '../types/todo'
import { CheckIcon, CheckedCircleIcon, ChevronDownIcon, CircleIcon, GripIcon, TrashIcon } from './icons'

const LIMIT_OPTIONS = [3, 5, 10, 0] as const // 0 = すべて
const DEFAULT_LIMIT = 5

// 表示件数はリストごとにブラウザへ保存する
function loadLimit(key: string): number {
  try {
    const raw = localStorage.getItem(`todo.limit.${key}`)
    if (raw === null) return DEFAULT_LIMIT
    const stored = Number(raw)
    return (LIMIT_OPTIONS as readonly number[]).includes(stored) ? stored : DEFAULT_LIMIT
  } catch {
    return DEFAULT_LIMIT
  }
}

function saveLimit(key: string, limit: number) {
  try {
    localStorage.setItem(`todo.limit.${key}`, String(limit))
  } catch {
    // 保存できなくてもこの画面では反映する
  }
}

type TaskListProps = {
  listKey: string
  heading: ReactNode
  headerExtra?: ReactNode
  subheader?: ReactNode
  items: Todo[]
  isDone: (todo: Todo) => boolean
  badge?: (todo: Todo) => ReactNode
  emptyText: string
  onToggle: (todo: Todo) => void
  onRename: (id: number, title: string) => void
  onDelete: (todo: Todo) => void
  onReorder: (ids: number[]) => void
}

// ドラッグで並び替えでき、表示件数を絞れるタスク一覧
function TaskList(props: TaskListProps) {
  const { listKey, heading, headerExtra, subheader, items, emptyText, onReorder } = props
  const [limit, setLimit] = useState(() => loadLimit(listKey))
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // メニューの外をクリック / Escapeで閉じる
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const showAll = limit === 0 || expanded
  const visible = showAll ? items : items.slice(0, limit)
  const hiddenCount = items.length - visible.length

  function chooseLimit(value: number) {
    setLimit(value)
    saveLimit(listKey, value)
    setExpanded(false)
    setMenuOpen(false)
  }

  // 表示中の行は常に先頭からの連続なので、全体の配列で入れ替えればよい
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((t) => t.id === active.id)
    const newIndex = items.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(items, oldIndex, newIndex).map((t) => t.id))
  }

  const limitLabel = limit === 0 ? 'すべて' : `${limit}件`

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-1.5 pt-3 pb-2 md:px-3 md:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">{heading}</h2>
        <div className="flex items-center gap-2">
          {headerExtra}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50 md:h-8"
            >
              表示 {limitLabel}
              <ChevronDownIcon size={14} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="最初に表示する件数"
                className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
              >
                <p className="px-2.5 py-1.5 text-[11px] text-slate-500">最初に表示する件数</p>
                {LIMIT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={limit === value}
                    onClick={() => chooseLimit(value)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] ${
                      limit === value ? 'bg-indigo-50 font-semibold text-indigo-800' : 'text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span>
                      {value === 0 ? 'すべて' : `${value}件`}
                      {value === DEFAULT_LIMIT && '（デフォルト）'}
                    </span>
                    {limit === value && <CheckIcon size={14} strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {subheader}

      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visible.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul>
              {visible.map((todo) => (
                <SortableRow key={todo.id} todo={todo} {...props} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {(hiddenCount > 0 || (expanded && limit !== 0 && items.length > limit)) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 h-11 w-full rounded-lg px-3 text-left text-[13px] text-slate-600 hover:bg-slate-50 md:h-9"
        >
          {hiddenCount > 0 ? `さらに表示（残り ${hiddenCount} 件）` : '折りたたむ'}
        </button>
      )}
    </section>
  )
}

type RowProps = TaskListProps & { todo: Todo }

function SortableRow({ todo, isDone, badge, onToggle, onRename, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: todo.id, disabled: isPendingTodo(todo) })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const done = isDone(todo)
  // 保存中（仮のID）のタスクはサーバーにまだないので、保存が終わるまで操作できなくする
  const pending = isPendingTodo(todo)

  function startEditing() {
    if (pending) return
    setDraft(todo.title)
    setEditing(true)
  }

  function commit() {
    const title = draft.trim()
    setEditing(false)
    if (title !== '' && title !== todo.title) onRename(todo.id, title)
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-busy={pending}
      className={`group relative flex min-h-[52px] items-center gap-0.5 rounded-xl px-1 md:min-h-0 md:gap-1 md:px-1.5 md:py-1 ${pending ? 'opacity-60' : ''} ${
        isDragging
          ? 'z-10 border border-indigo-300 bg-white shadow-lg shadow-indigo-600/15'
          : 'hover:bg-slate-50'
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        disabled={pending}
        aria-label={`「${todo.title}」を並び替え`}
        className={`flex h-11 w-7 shrink-0 touch-none items-center justify-center rounded-md md:h-8 ${
          isDragging ? 'cursor-grabbing text-indigo-600' : 'cursor-grab text-slate-400 hover:text-slate-600'
        }`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <button
        type="button"
        onClick={() => onToggle(todo)}
        disabled={pending}
        aria-label={done ? `「${todo.title}」を未完了に戻す` : `「${todo.title}」を完了にする`}
        aria-pressed={done}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 md:size-8"
      >
        {done ? <CheckedCircleIcon size={21} /> : <CircleIcon size={21} />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={200}
          aria-label="タスク名を編集"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="min-w-0 flex-1 rounded-md border border-indigo-300 px-2 py-1 text-[15px] outline-none focus:ring-2 focus:ring-indigo-200 md:text-sm"
        />
      ) : (
        <span
          onDoubleClick={startEditing}
          title="ダブルクリックで編集"
          className={`min-w-0 flex-1 break-words px-1 text-[15px] md:text-sm ${
            done ? 'text-slate-500 line-through' : 'text-slate-900'
          }`}
        >
          {todo.title}
        </span>
      )}

      {badge?.(todo)}
      <button
        type="button"
        onClick={() => onDelete(todo)}
        disabled={pending}
        aria-label={`「${todo.title}」を削除`}
        title="削除"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 focus-visible:opacity-100 md:size-8 md:opacity-0 md:group-hover:opacity-100"
      >
        <TrashIcon />
      </button>
    </li>
  )
}

export default TaskList
