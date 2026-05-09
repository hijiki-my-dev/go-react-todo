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

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>){
    e.preventDefault();
    console.log(`送信するデータ: ${title}`)
    const post = {title}

    axios.post('todos', post)
        .then(response => {
            console.log(`Todo作成: ${response.data}`)
            setTodos(prev => [...prev, response.data])
        })
        .catch(error => {
            console.error('投稿作成エラー:', error);
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
          <p>
            タスク一覧
          </p>
          <ul>
            {todos.map(todo => (
                <li key={todo.id}>{todo.title}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}

export default App
