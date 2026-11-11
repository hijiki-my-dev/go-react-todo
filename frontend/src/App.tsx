import Home from './pages/home.tsx'
import Login from './pages/login.tsx'
import Completed from './pages/completed.tsx'
import Trash from './pages/trash.tsx'
import ProtectedRoute from './auth/ProtectedRoute.tsx'
import AppLayout from './layouts/AppLayout.tsx'
import { Routes, Route, Navigate } from 'react-router'

function App() {
  return(
    <Routes>
      {/* 誰でもアクセスできるページ */}
      <Route path="/login" element={<Login />} />

      {/* ログイン必須のページ。この中に Route を足せば全部守られる */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/completed" element={<Completed />} />
          <Route path="/trash" element={<Trash />} />
        </Route>
      </Route>

      {/* 存在しないURLはトップへ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
