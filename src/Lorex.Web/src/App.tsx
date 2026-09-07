import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireGuest } from './auth/routes'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import UniverseOverview from './pages/UniverseOverview'
import UniverseSettings from './pages/UniverseSettings'
import UniverseWorkspace from './pages/UniverseWorkspace'
import UniversesPage from './pages/UniversesPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<RequireGuest />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/app" element={<UniversesPage />} />
            <Route path="/app/universes/:id" element={<UniverseWorkspace />}>
              <Route index element={<UniverseOverview />} />
              <Route path="settings" element={<UniverseSettings />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
