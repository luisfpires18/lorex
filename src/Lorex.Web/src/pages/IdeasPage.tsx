import type { ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AccountMenu } from '../components/AccountMenu'
import { BrandMark } from '../components/BrandMark'
import { IdeasBrowser } from '../components/IdeasBrowser'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { Wordmark } from '../components/Wordmark'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * The account-level frame the global Ideas screens wear: the same bar as the universe browser and the Profile screen,
 * because ideas belong to the account and to no one world.
 */
export function IdeasHome({ children }: { children: ReactNode }) {
  return (
    <div className="home">
      <header className="home__bar">
        <span className="home__brand">
          <BrandMark />
          <Wordmark />
        </span>
        <div className="home__session">
          <Link className="home__back" to="/app" data-testid="ideas-universes">
            All universes
          </Link>
          <AccountMenu variant="bar" />
        </div>
      </header>

      <main className="home__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}

/**
 * Ideas: every idea the account has at `/app/ideas`, or one universe's inside its workspace. One list either way
 * (`IdeasBrowser`) - not two idea systems.
 */
export default function IdeasPage({ inUniverse = false }: { inUniverse?: boolean }) {
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null

  if (universe) {
    return (
      <IdeasBrowser
        universe={{ id: universe.id, name: universe.name }}
        basePath={`/app/universes/${universe.id}/ideas`}
      />
    )
  }

  return (
    <IdeasHome>
      <IdeasBrowser universe={null} basePath="/app/ideas" />
    </IdeasHome>
  )
}
