import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

/** Held while the session probe is in flight, so no screen paints before it settles. */
function SessionPending() {
  return <div className="session-pending" role="status" aria-label="Checking your session" />
}

/** Sends signed-out visitors to the sign-in page, remembering where they were headed. */
export function RequireAuth() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionPending />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <Outlet />
}

/** Keeps signed-in people out of the sign-in and registration screens. */
export function RequireGuest() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <SessionPending />
  if (user) return <Navigate to="/app" replace />
  return <Outlet />
}
