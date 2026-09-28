import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { AccountMenu } from './AccountMenu'
import { BrandMark } from './BrandMark'
import { PortalSearch } from './PortalSearch'
import { MAIN_CONTENT_ID } from './SkipLink'
import { Wordmark } from './Wordmark'

/**
 * The public portal's frame: its own bar and its own `main`, and none of the workspace's chrome - no rail, no
 * universe sidebar, no search over one universe (ADR 0036). One application with two layouts rather than two
 * applications: the session, the router and the build are shared, so a visitor may be signed in or not and the
 * bar says which way to go - Log in and Create account, or My workspace and their account.
 *
 * The portal is where Lorex starts, signed in or not. Logging in from it comes back to the same page (the page is
 * passed as router state, which `returnPath` checks); the workspace is entered only by choosing My workspace, and
 * signing out from here stays here.
 *
 * The portal is dark whatever the workspace's scheme: `.portal` redefines the shared tokens for everything
 * inside it, so buttons, notices and menus drawn here follow without a second set of components. The bar is
 * a solid band above every page, holding the brand, Explore, the search (see `PortalSearch`) and the way in.
 */
export function PublicLayout() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const here = `${location.pathname}${location.search}`

  return (
    <div className="portal">
      <header className="portal__bar">
        <Link className="portal__brand" to="/explore">
          <BrandMark />
          <Wordmark />
        </Link>
        <nav className="portal__nav" aria-label="Portal">
          <NavLink className="portal__link" to="/explore" end>
            Explore
          </NavLink>
        </nav>
        <PortalSearch />
        <div className="portal__session" data-testid="portal-session">
          {isLoading ? null : user ? (
            <>
              <Link
                className="portal__pill portal__workspace"
                to="/app"
                data-testid="portal-workspace"
              >
                My workspace
                <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.75} />
              </Link>
              <AccountMenu variant="bar" signedOutTo={here} />
            </>
          ) : (
            <>
              <Link
                className="portal__pill"
                to="/login"
                state={{ from: here }}
                data-testid="portal-login"
              >
                Log in
              </Link>
              <Link
                className="portal__pill portal__pill--primary"
                to="/register"
                state={{ from: here }}
                data-testid="portal-join"
              >
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
