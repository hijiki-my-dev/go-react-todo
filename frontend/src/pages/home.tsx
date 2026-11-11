import TaskBoard from '../components/TaskBoard'
import { useApiTodos } from '../hooks/useApiTodos'

function Home() {
  const model = useApiTodos()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 md:gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">メイン</h1>
      <TaskBoard model={model} />
    </div>
  )
}

export default Home
