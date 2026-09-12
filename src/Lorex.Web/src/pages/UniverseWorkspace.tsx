import { UserRound } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { getUniverse } from '../universes/api'
import type { UniverseDetail } from '../universes/types'

/**
 * The sections a universe has, in the order the sidebar lists them. Held as data rather
 * than as markup because the narrow layout needs the same list twice: once as the list of
 * links, and once to name the section the author is currently in.
 */
const SECTIONS = [
  { segment: '', label: 'Overview', testId: 'workspace-overview' },
  { segment: 'lore', label: 'Lore', testId: 'workspace-lore' },
  { segment: 'timeline', label: 'Timeline', testId: 'workspace-timeline' },
  { segment: 'canon', label: 'Canon', testId: 'workspace-canon' },
  { segment: 'types', label: 'Types', testId: 'workspace-types' },
  { segment: 'trash', label: 'Trash', testId: 'workspace-trash' },
] as const

/**
 * Sections that exist in the plan but not yet in the product. They are shown so the shape
 * of a universe is legible, and disabled so nothing pretends to work.
 */
const PLANNED = ['Stories', 'Plot', 'Ideas', 'Search']

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; universe: UniverseDetail }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export interface WorkspaceContext {
  universe: UniverseDetail
  refresh: (next?: UniverseDetail) => void
}

/** The part of the URL below this universe, without its surrounding slashes. */
function pathWithin(pathname: string, id: string | undefined) {
  const base = `/app/universes/${id ?? ''}`
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : ''
  return rest.replace(/^\/+|\/+$/g, '')
}

/** Which section the current URL is in. `lore/:entityId` is still Lore. */
function currentSection(pathname: string, id: string | undefined) {
  const segment = pathWithin(pathname, id).split('/')[0] ?? ''
  if (segment === 'settings') return 'Settings'
  return SECTIONS.find((section) => section.segment === segment)?.label ?? 'Overview'
}

export default function UniverseWorkspace() {
  const { id } = useParams<{ id: string }>()
  const { pathname } = useLocation()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  // Only the narrow layout hides the section list; on a wide screen CSS keeps it open and
  // the toggle is not shown at all, so one piece of state serves both without measuring
  // the viewport in JavaScript.
  //
  // What is stored is the route the list was opened on, not a boolean, so "open" means
  // "opened here". A section that has just been opened is then never read through the list
  // that opened it, and arriving by the browser's own back and forward closes it too -
  // both fall out of the render rather than out of an effect chasing the URL.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null)
  const isNavOpen = navOpenAt === pathname
  const navId = useId()

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!id) return
      getUniverse(id, signal)
        .then((universe) => setState({ kind: 'ready', universe }))
        .catch((error: unknown) => {
          if (signal?.aborted) return
          // The API answers 404 both for a missing universe and for someone else's.
          const status = (error as { status?: number }).status
          setState(
            status === 404
              ? { kind: 'missing' }
              : {
                  kind: 'error',
                  message: error instanceof Error ? error.message : 'Could not open this universe.',
                },
          )
        })
    },
    [id],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  const refresh = useCallback(
    (next?: UniverseDetail) => {
      if (next) {
        setState({ kind: 'ready', universe: next })
      } else {
        load()
      }
    },
    [load],
  )

  if (state.kind === 'loading') {
    return (
      <p className="notice" role="status">
        Opening…
      </p>
    )
  }

  if (state.kind === 'missing') {
    return (
      <div className="empty" data-testid="universe-missing">
        <p className="empty__line">That universe is not here.</p>
        <p className="empty__hint">
          It may have been deleted, or it belongs to someone else.{' '}
          <Link to="/app">Back to your universes</Link>
        </p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert">
        <p>{state.message}</p>
        <button className="button button--quiet" type="button" onClick={() => refresh()}>
          Try again
        </button>
      </div>
    )
  }

  const { universe } = state
  const accent = universe.accentColor ?? undefined

  return (
    <div
      className="workspace"
      style={accent ? { ['--universe-accent' as string]: accent } : undefined}
    >
      <nav className="rail" aria-label="Lorex">
        <Link className="rail__mark" to="/app" title="Back to your universes">
          L
        </Link>
        <span className="rail__seal" aria-hidden="true" />

        {/* Only rendered into the narrow layout, where the sidebar head is folded away:
            the bar has to keep saying which universe and which section this is. */}
        <p className="rail__where" data-testid="workspace-where">
          <span className="rail__universe">{universe.name}</span>
          <span className="rail__section">{currentSection(pathname, id)}</span>
          {universe.isArchived ? <span className="rail__archived">Archived</span> : null}
        </p>

        <button
          className="rail__toggle"
          type="button"
          aria-expanded={isNavOpen}
          aria-controls={navId}
          onClick={() => setNavOpenAt(isNavOpen ? null : pathname)}
          data-testid="workspace-nav-toggle"
        >
          {isNavOpen ? 'Close' : 'Sections'}
        </button>
      </nav>

      <aside className="sidebar" id={navId} data-open={isNavOpen ? 'true' : 'false'}>
        <div className="sidebar__head">
          <Link className="sidebar__back" to="/app">
            All universes
          </Link>
          <h1 className="sidebar__name" data-testid="workspace-name">
            {universe.name}
          </h1>
          {universe.isArchived ? <span className="sidebar__archived">Archived</span> : null}
        </div>

        <ul className="sidebar__nav">
          {SECTIONS.map((section) => (
            <li key={section.label}>
              <NavLink
                to={section.segment === '' ? '.' : section.segment}
                end={section.segment === ''}
                className="sidebar__link"
                data-testid={section.testId}
              >
                {section.label}
              </NavLink>
            </li>
          ))}
          {PLANNED.map((label) => (
            <li key={label}>
              <span className="sidebar__link sidebar__link--planned" aria-disabled="true">
                {label}
              </span>
            </li>
          ))}
          <li>
            <NavLink to="settings" className="sidebar__link" data-testid="workspace-settings">
              Settings
            </NavLink>
          </li>
          {/* Not a section of this universe but of the account that owns it, which is why it
              carries a picture none of the others do and an absolute path out of the world. */}
          <li>
            <NavLink to="/app/profile" className="sidebar__link" data-testid="workspace-profile">
              Profile
              <UserRound
                className="sidebar__icon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
            </NavLink>
          </li>
        </ul>

        <p className="sidebar__soon">Greyed sections are not built yet.</p>
      </aside>

      <main className="canvas">
        <Outlet context={{ universe, refresh } satisfies WorkspaceContext} />
      </main>
    </div>
  )
}
