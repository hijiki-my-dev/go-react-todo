import { useState, useEffect } from 'react'
import axios from 'axios'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

type Todo = {
    id: number
    title: string
    done: boolean
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  // 編集中のTodo IDと入力中のタイトルを管理するstate
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>){
    e.preventDefault();
    console.log(`送信するデータ: ${title}`)
    const post = {title}

    axios.post('todos', post)
        .then(response => {
            console.log(`Todo作成: ${response.data}`)
            setTodos(prev => [...prev, response.data])
            setTitle('')
        })
        .catch(error => {
            console.error('投稿作成エラー:', error);
        })
  }

  // ダブルクリックで編集モードに入る
  function startEditing(todo: Todo) {
    setEditingId(todo.id)
    setEditingTitle(todo.title)
  }

  // 編集を確定してAPIに送信する
  function commitEdit(id: number) {
    if (editingTitle.trim() === '') return
    axios.patch(`/todos/${id}`, { title: editingTitle })
      .then(response => {
        setTodos(prev => prev.map(t => t.id === id ? response.data : t))
        setEditingId(null)
      })
      .catch(error => {
        console.error('更新エラー:', error)
      })
  }

  // Enterで確定、Escapeでキャンセル
  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: number) {
    if (e.key === 'Enter') commitEdit(id)
    if (e.key === 'Escape') setEditingId(null)
  }

  function deleteTodo(todoId: number) {
    axios.delete(`/todos/${todoId}`)
      .then(response => {
        console.log(`削除: ${response.data}`)
        setTodos(todos.filter(todo => todo.id !== todoId))
      })
  }

  useEffect(() => {
    axios.get('/todos')
      .then(response => {
        setTodos(response.data);
      })
      .catch(error => {
        console.error('データ取得エラー:', error);
      });
  }, [])

  return (
    <>
      <section id="center">
        <div>
          <h1>Go×React Todo アプリ</h1>
          <form onSubmit={handleSubmit}>
            <label>
                新規Todo: <input name="newTodo" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button type='submit'>追加</button>
          </form>
          <p>タスク一覧（ダブルクリックで編集可能）</p>
          <ul>
            {todos.map(todo => (
              <>
              <li key={todo.id}>
                {editingId === todo.id ? (
                  // 編集モード: inputを表示
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={e => setEditingTitle(e.target.value)}
                    onBlur={() => commitEdit(todo.id)}
                    onKeyDown={e => handleEditKeyDown(e, todo.id)}
                  />
                ) : (
                  // 通常モード: ダブルクリックで編集モードへ
                  <span onDoubleClick={() => startEditing(todo)}>{todo.title}</span>
                )}
              </li>
              <button type='button' onClick={() => deleteTodo(todo.id)}>削除</button>
              </>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}

export default App
