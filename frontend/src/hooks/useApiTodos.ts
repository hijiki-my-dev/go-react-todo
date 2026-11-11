import { useEffect, useState } from 'react'
import { api } from '../api'
import { sortTodos, type Todo, type TodoBoardModel, type TodoKind } from '../types/todo'

// サーバーに保存するメイン画面用のTodo操作
export function useApiTodos(): TodoBoardModel {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Todo[]>('/todos')
      .then((response) => setTodos(sortTodos(response.data)))
      .catch((err) => {
        console.error('データ取得エラー:', err)
        setError('タスクの取得に失敗しました。再読み込みしてください。')
      })
      .finally(() => setLoading(false))
  }, [])

  function replace(todo: Todo) {
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? todo : t)))
  }

  async function add(title: string, kind: TodoKind) {
    setError('')
    try {
      const response = await api.post<Todo>('/todos', { title, kind })
      setTodos((prev) => [...prev, response.data])
      return true
    } catch (err) {
      console.error('作成エラー:', err)
      setError('タスクの追加に失敗しました。')
      return false
    }
  }

  async function rename(id: number, title: string) {
    setError('')
    try {
      const response = await api.patch<Todo>(`/todos/${id}`, { title })
      replace(response.data)
    } catch (err) {
      console.error('更新エラー:', err)
      setError('タスクの更新に失敗しました。')
    }
  }

  async function setDone(id: number, done: boolean) {
    setError('')
    try {
      const response = await api.patch<Todo>(`/todos/${id}`, { done })
      replace(response.data)
    } catch (err) {
      console.error('更新エラー:', err)
      setError('タスクの更新に失敗しました。')
    }
  }

  // ゴミ箱へ移動する
  async function remove(id: number) {
    setError('')
    try {
      await api.delete(`/todos/${id}`)
      setTodos((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      console.error('削除エラー:', err)
      setError('タスクの削除に失敗しました。')
    }
  }

  // 画面を先に並び替えてから保存する。失敗したら元に戻す
  function reorder(ids: number[]) {
    const before = todos
    setTodos((prev) => {
      const position = new Map(ids.map((id, i) => [id, i]))
      return sortTodos(prev.map((t) => (position.has(t.id) ? { ...t, position: position.get(t.id)! } : t)))
    })
    setError('')
    api.put('/todos/order', { ids }).catch((err) => {
      console.error('並び替えエラー:', err)
      setTodos(before)
      setError('並び順の保存に失敗しました。')
    })
  }

  return { todos, loading, error, add, rename, setDone, remove, reorder }
}
