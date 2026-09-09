import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { getUniverse } from '../universes/api'
import type { UniverseDetail } from '../universes/types'

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

export default function UniverseWorkspace() {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

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
      </nav>

      <aside className="sidebar">
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
          <li>
            <NavLink to="." end className="sidebar__link">
              Overview
            </NavLink>
          </li>
          <li>
            <NavLink to="lore" className="sidebar__link" data-testid="workspace-lore">
              Lore
            </NavLink>
          </li>
          <li>
            <NavLink to="timeline" className="sidebar__link" data-testid="workspace-timeline">
              Timeline
            </NavLink>
          </li>
          <li>
            <NavLink to="canon" className="sidebar__link" data-testid="workspace-canon">
              Canon
            </NavLink>
          </li>
          <li>
            <NavLink to="types" className="sidebar__link" data-testid="workspace-types">
              Types
            </NavLink>
          </li>
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
        </ul>

        <p className="sidebar__soon">Greyed sections are not built yet.</p>
      </aside>

      <main className="canvas">
        <Outlet context={{ universe, refresh } satisfies WorkspaceContext} />
      </main>
    </div>
  )
}
