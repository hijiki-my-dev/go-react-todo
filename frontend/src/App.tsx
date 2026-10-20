import './App.css'

import Home from './pages/home.tsx'
import Login from './pages/login.tsx'
import ProtectedRoute from './auth/ProtectedRoute.tsx'
import { Routes, Route, Navigate } from 'react-router'

function App() {
  return(
    <Routes>
      {/* 誰でもアクセスできるページ */}
      <Route path="/login" element={<Login />} />

      {/* ログイン必須のページ。この中に Route を足せば全部守られる */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
      </Route>

      {/* 存在しないURLはトップへ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
