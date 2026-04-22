import { Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin.jsx'
import Cliente from './pages/Cliente.jsx'
import NovoTicket from './pages/NovoTicket.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/cliente" element={<Cliente />} />
      <Route path="/cliente/novo" element={<NovoTicket />} />
      <Route
        path="*"
        element={
          <div className="flex items-center justify-center h-full p-8 text-gray-600">
            Rota não encontrada.
          </div>
        }
      />
    </Routes>
  )
}
