import { useState, useEffect } from 'react'
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

  useEffect(() => {
    fetch('/todos')
      .then(res => res.json())
      .then(data => setTodos(data))
  }, [])

  return (
    <>
      <section id="center">
        <div>
          <h1>Go×React Todo アプリ</h1>
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
