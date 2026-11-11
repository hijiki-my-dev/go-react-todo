import { useState } from 'react'
import { isDoneNow, periodStart, type Todo, type TodoBoardModel } from '../types/todo'
import AddTask from './AddTask'
import TaskList from './TaskList'
import { RepeatIcon } from './icons'

type RecurringKind = 'weekly' | 'monthly'

function periodLabel(kind: RecurringKind, now = new Date()): string {
  const start = periodStart(kind, now)
  if (kind === 'monthly') return `${start.getMonth() + 1}月`
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `今週 ${start.getMonth() + 1}/${start.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`
}

type TaskBoardProps = {
  model: TodoBoardModel
  addPlaceholder?: string
}

// メイン画面の本体。PC: 左に個別タスク・右に定期タスク / スマホ: 定期タスク → 個別タスク
function TaskBoard({ model, addPlaceholder }: TaskBoardProps) {
  const [period, setPeriod] = useState<RecurringKind>('weekly')
  const { todos, loading, error } = model

  // 完了した個別タスクは「完了タスク」ページへ移るのでここには出さない
  const singles = todos.filter((t) => t.kind === 'single' && !t.done)
  const recurring = todos.filter((t) => t.kind === period)
  const recurringDone = recurring.filter((t) => isDoneNow(t)).length
  const progress = recurring.length === 0 ? 0 : Math.round((recurringDone / recurring.length) * 100)

  function toggle(todo: Todo) {
    model.setDone(todo.id, !isDoneNow(todo))
  }

  const common = {
    isDone: isDoneNow,
    onToggle: toggle,
    onRename: model.rename,
    onDelete: model.remove,
    onReorder: model.reorder,
  }

  const periodTabs = (
    <div role="tablist" aria-label="期間" className="flex rounded-lg bg-slate-100 p-[3px]">
      {(['weekly', 'monthly'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={period === k}
          onClick={() => setPeriod(k)}
          className={`h-8 rounded-md px-3.5 text-[13px] md:h-[26px] md:px-3 md:text-xs ${
            period === k ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          {k === 'weekly' ? '週ごと' : '月ごと'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <AddTask onAdd={model.add} placeholder={addPlaceholder} />
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中...</p>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
          <div className="order-2 min-w-0 lg:order-1 lg:flex-[3]">
            <TaskList
              listKey="single"
              heading={
                <>
                  個別タスク <span className="font-medium text-slate-500">{singles.length}</span>
                </>
              }
              items={singles}
              emptyText="タスクはありません。上のフォームから追加できます。"
              {...common}
            />
          </div>
          <div className="order-1 min-w-0 lg:order-2 lg:flex-[2]">
            <TaskList
              key={period}
              listKey={period}
              heading={
                <>
                  <RepeatIcon size={16} className="text-indigo-600" />
                  定期タスク
                </>
              }
              headerExtra={periodTabs}
              subheader={
                recurring.length > 0 && (
                  <div className="flex items-center gap-2.5 px-2 pb-2">
                    <span className="text-xs whitespace-nowrap text-slate-500">
                      {periodLabel(period)} ・ {recurringDone} / {recurring.length} 完了
                    </span>
                    <div aria-hidden="true" className="h-1 flex-1 rounded-full bg-slate-200">
                      <div className="h-1 rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )
              }
              items={recurring}
              emptyText={`${period === 'weekly' ? '毎週' : '毎月'}のタスクはありません。種類を「${period === 'weekly' ? '毎週' : '毎月'}」にして追加できます。`}
              {...common}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default TaskBoard
