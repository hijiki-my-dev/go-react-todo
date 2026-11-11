// single: 個別タスク、weekly/monthly: 定期タスク
export type TodoKind = 'single' | 'weekly' | 'monthly'

export type Todo = {
  id: number
  title: string
  done: boolean
  kind: TodoKind
  position: number
  doneAt: string | null
}

export const kindLabels: Record<TodoKind, string> = {
  single: '個別',
  weekly: '毎週',
  monthly: '毎月',
}

// メイン画面（API版・サンプル版）で共通の操作
export type TodoBoardModel = {
  todos: Todo[]
  loading: boolean
  error: string
  add: (title: string, kind: TodoKind) => Promise<boolean>
  rename: (id: number, title: string) => Promise<void>
  setDone: (id: number, done: boolean) => Promise<void>
  remove: (id: number) => Promise<void>
  reorder: (ids: number[]) => void
}

// 今週（月曜始まり）・今月の開始日時
export function periodStart(kind: 'weekly' | 'monthly', now = new Date()): Date {
  if (kind === 'monthly') return new Date(now.getFullYear(), now.getMonth(), 1)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysSinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

// 定期タスクは「今週/今月に完了したか」で完了扱いを決める。期間が変わると未完了に戻る
export function isDoneNow(todo: Todo, now = new Date()): boolean {
  if (!todo.done) return false
  if (todo.kind === 'single') return true
  if (!todo.doneAt) return false
  return new Date(todo.doneAt) >= periodStart(todo.kind, now)
}

// 並び順（position → id）で並べる
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => a.position - b.position || a.id - b.id)
}
