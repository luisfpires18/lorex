import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function AppPage() {
  const { user, logOut } = useAuth()
  const navigate = useNavigate()
  const [isLeaving, setIsLeaving] = useState(false)

  async function handleLogOut() {
    setIsLeaving(true)
    await logOut()
    await navigate('/login', { replace: true })
  }

  return (
    <div className="workspace">
      <header className="workspace__bar">
        <span className="wordmark">Lorex</span>
        <div className="workspace__session">
          <span className="workspace__user" data-testid="signed-in-user">
            {user?.username}
          </span>
          <button
            className="button button--quiet"
            type="button"
            onClick={handleLogOut}
            disabled={isLeaving}
          >
            {isLeaving ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="workspace__body">
        <p className="workspace__empty">Your universes will appear here.</p>
      </main>
    </div>
  )
}
