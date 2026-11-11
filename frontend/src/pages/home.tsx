import { useState, useEffect, useRef } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { api } from '../api'
import '../App.css'

type Todo = {
    id: number
    title: string
    done: boolean
}

function Home() {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const signingOut = useRef(false)

  async function handleLogout() {
    if (signingOut.current) return
    signingOut.current = true
    setIsSigningOut(true)
    setLogoutError('')
    try {
      await signOut(auth)
      // ProtectedRouteが未ログイン状態を検知してログイン画面へ戻す
    } catch {
      setLogoutError('ログアウトに失敗しました。もう一度お試しください。')
    } finally {
      signingOut.current = false
      setIsSigningOut(false)
    }
  }

  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  // 編集中のTodo IDと入力中のタイトルを管理するstate
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>){
    e.preventDefault();
    console.log(`送信するデータ: ${title}`)
    const post = {title}

    api.post('/todos', post)
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
    api.patch(`/todos/${id}`, { title: editingTitle })
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
    api.delete(`/todos/${todoId}`)
      .then(response => {
        console.log(`削除: ${response.data}`)
        setTodos(todos.filter(todo => todo.id !== todoId))
      })
  }

  useEffect(() => {
    api.get('/todos')
      .then(response => {
        setTodos(response.data);
      })
      .catch(error => {
        console.error('データ取得エラー:', error);
      });
  }, [])

  return (
    <>
      <section id='top'>
        <div>
          <ul>
            <li></li>
            <li></li>
          </ul>
        </div>
      </section>
      <section id="center">
        <div>
          <h1>Go×React Todo アプリ</h1>
          <button type="button" onClick={handleLogout} disabled={isSigningOut} aria-busy={isSigningOut}>
            {isSigningOut ? 'ログアウト中...' : 'ログアウト'}
          </button>
          {logoutError && <p role="alert">{logoutError}</p>}
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

export default Home