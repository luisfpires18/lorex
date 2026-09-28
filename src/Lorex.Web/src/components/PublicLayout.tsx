import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { BrandMark } from './BrandMark'
import { MAIN_CONTENT_ID } from './SkipLink'
import { Wordmark } from './Wordmark'

/**
 * The public portal's frame: its own bar and its own `main`, and none of the workspace's chrome - no rail, no
 * universe sidebar, no search over one universe (ADR 0036). One application with two layouts rather than two
 * applications: the session, the router and the build are shared, so a visitor may be signed in or not and the
 * bar says which way to go - Sign in and Create account, or back to their workspace.
 *
 * Structure only. How the portal looks is the Explore task's.
 */
export function PublicLayout() {
  const { user, isLoading } = useAuth()

  return (
    <div className="portal">
      <header className="portal__bar">
        <Link className="portal__brand" to="/explore">
          <BrandMark />
          <Wordmark />
        </Link>
        <nav className="portal__nav" aria-label="Portal">
          <NavLink className="portal__link" to="/explore">
            Explore
          </NavLink>
        </nav>
        <div className="portal__session" data-testid="portal-session">
          {isLoading ? null : user ? (
            <Link className="portal__link" to="/app" data-testid="portal-workspace">
              My workspace
            </Link>
          ) : (
            <>
              <Link className="portal__link" to="/login">
                Sign in
              </Link>
              <Link className="button button--secondary portal__join" to="/register">
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="portal__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
