import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { SunMoon } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { AccountMenu } from './AccountMenu'
import { ActionMenu } from './ActionMenu'
import { BRAND_LINK_LABEL, BrandMark } from './BrandMark'
import { PortalSearch } from './PortalSearch'
import { ThemeSwitch } from './ThemeSwitch'
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
 * What a visitor sees this side of Lorex called is Explore - its one destination, the brand's, and its landmark's name;
 * "portal" is the architecture's word for it, not the screen's. My workspace is a plain link across, in the same tab:
 * no outward arrow, which would say it opened somewhere else.
 *
 * The portal follows Lorex's one theme (013), in its own look: `.portal` redefines the shared tokens for everything
 * inside it, dark or light, so buttons, notices and menus drawn here follow without a second set of components. The
 * bar is a solid band above every page, holding the brand, Explore, the search (see `PortalSearch`) and the way in.
 * The theme is chosen in the account menu; signed out, where there is no account menu, from Appearance beside Log in.
 */
export function PublicLayout() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const here = `${location.pathname}${location.search}`

  return (
    <div className="portal">
      <header className="portal__bar">
        <Link className="portal__brand" to="/explore" aria-label={BRAND_LINK_LABEL}>
          <BrandMark />
          <Wordmark />
        </Link>
        <nav className="portal__nav" aria-label="Explore">
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
              </Link>
              <AccountMenu variant="bar" signedOutTo={here} />
            </>
          ) : (
            <>
              <ActionMenu
                label="Appearance"
                trigger={<SunMoon aria-hidden="true" size={18} strokeWidth={1.75} />}
                triggerClassName="portal__appearance"
                panelClassName="portal__appearancepanel"
                triggerTestId="portal-appearance"
              >
                <ThemeSwitch inMenu />
              </ActionMenu>
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
