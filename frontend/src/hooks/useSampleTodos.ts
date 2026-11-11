import { useState } from 'react'
import { sortTodos, type Todo, type TodoBoardModel, type TodoKind } from '../types/todo'

function sampleTodo(id: number, title: string, kind: TodoKind): Todo {
  return { id, title, kind, position: id, done: false, doneAt: null, deletedAt: null }
}

const initialTodos: Todo[] = [
  sampleTodo(1, 'ダブルクリックでタイトルを編集', 'single'),
  sampleTodo(2, '左のつまみをドラッグして並び替え', 'single'),
  sampleTodo(3, '丸を押すと完了になります', 'single'),
  sampleTodo(4, '週に一度の振り返り', 'weekly'),
  sampleTodo(5, 'ランニング', 'weekly'),
  sampleTodo(6, '家計簿をつける', 'monthly'),
]

// サンプルページ用。データはこの画面のメモリ上だけに持ち、サーバーには送らない
export function useSampleTodos(): TodoBoardModel & { reset: () => void } {
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [nextId, setNextId] = useState(initialTodos.length + 1)

  function update(id: number, patch: Partial<Todo>) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function add(title: string, kind: TodoKind) {
    const position = Math.max(-1, ...todos.map((t) => t.position)) + 1
    setTodos((prev) => [...prev, { ...sampleTodo(nextId, title, kind), position }])
    setNextId((id) => id + 1)
    return true
  }

  async function rename(id: number, title: string) {
    update(id, { title })
  }

  async function setDone(id: number, done: boolean) {
    update(id, { done, doneAt: done ? new Date().toISOString() : null })
  }

  async function remove(id: number) {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  function reorder(ids: number[]) {
    const position = new Map(ids.map((id, i) => [id, i]))
    setTodos((prev) =>
      sortTodos(prev.map((t) => (position.has(t.id) ? { ...t, position: position.get(t.id)! } : t))),
    )
  }

  function reset() {
    setTodos(initialTodos)
    setNextId(initialTodos.length + 1)
  }

  return { todos, loading: false, error: '', add, rename, setDone, remove, reorder, reset }
}
