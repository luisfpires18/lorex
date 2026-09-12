import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { UniverseCard } from '../components/UniverseCard'
import { UniverseForm } from '../components/UniverseForm'
import { Wordmark } from '../components/Wordmark'
import { createUniverse, listUniverses } from '../universes/api'
import type { UniversePage } from '../universes/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: UniversePage } | { kind: 'error'; message: string }

export default function UniversesPage() {
  const { user, logOut } = useAuth()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [isCreating, setIsCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    // Debounced so typing in the search box does not fire a request per keystroke.
    const timer = setTimeout(() => {
      listUniverses({ search, includeArchived, page }, controller.signal)
        .then((result) => setState({ kind: 'ready', page: result }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Could not load your universes.',
          })
        })
    }, 150)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, includeArchived, page, reloadKey])

  async function handleLogOut() {
    await logOut()
    await navigate('/login', { replace: true })
  }

  function changeFilter(next: boolean) {
    setIncludeArchived(next)
    setPage(1)
  }

  function changeSearch(next: string) {
    setSearch(next)
    setPage(1)
  }

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim().length > 0

  return (
    <div className="home">
      <header className="home__bar">
        <Wordmark />
        <div className="home__session">
          <Link className="home__user" to="/app/profile" data-testid="signed-in-user">
            {user?.username}
          </Link>
          <button className="button button--quiet" type="button" onClick={handleLogOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="home__body">
        <div className="home__heading">
          <h1 className="home__title">Universes</h1>
          <button
            className="button"
            type="button"
            onClick={() => setIsCreating(true)}
            data-testid="new-universe"
          >
            New universe
          </button>
        </div>

        {isCreating ? (
          <section className="composer" aria-label="Create a universe">
            <h2 className="composer__title">Name a new world</h2>
            <UniverseForm
              submitLabel="Create universe"
              busyLabel="Creating"
              onCancel={() => setIsCreating(false)}
              onSubmit={async (input) => {
                const created = await createUniverse(input)
                await navigate(`/app/universes/${created.id}`)
              }}
            />
          </section>
        ) : null}

        <div className="controls">
          <div className="controls__search">
            <label className="field__label" htmlFor="universe-search">
              Search
            </label>
            <input
              id="universe-search"
              className="field__input"
              type="search"
              placeholder="Name of a world"
              value={search}
              onChange={(event) => changeSearch(event.target.value)}
            />
          </div>

          <div className="segmented" role="group" aria-label="Archive filter">
            <button
              type="button"
              className="segmented__option"
              aria-pressed={!includeArchived}
              onClick={() => changeFilter(false)}
            >
              Active
            </button>
            <button
              type="button"
              className="segmented__option"
              aria-pressed={includeArchived}
              onClick={() => changeFilter(true)}
              data-testid="filter-all"
            >
              All
            </button>
          </div>
        </div>

        {state.kind === 'loading' ? (
          <p className="notice" role="status">
            Gathering your universes…
          </p>
        ) : null}

        {state.kind === 'error' ? (
          <div className="notice notice--error" role="alert">
            <p>{state.message}</p>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              Try again
            </button>
          </div>
        ) : null}

        {result && result.items.length > 0 ? (
          <ul className="plates" data-testid="universe-grid">
            {result.items.map((universe) => (
              <li key={universe.id}>
                <UniverseCard universe={universe} />
              </li>
            ))}
          </ul>
        ) : null}

        {result && result.items.length === 0 ? (
          <div className="empty" data-testid="universe-empty">
            <p className="empty__line">
              {isFiltered ? 'Nothing here by that name.' : 'No universes yet.'}
            </p>
            <p className="empty__hint">
              {isFiltered
                ? 'Try a different word, or clear the search.'
                : 'Start one, and everything you invent will hang off it.'}
            </p>
          </div>
        ) : null}

        {result && result.totalPages > 1 ? (
          <nav className="pager" aria-label="Pagination">
            <button
              className="button button--quiet"
              type="button"
              disabled={result.page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="pager__position">
              Page {result.page} of {result.totalPages}
            </span>
            <button
              className="button button--quiet"
              type="button"
              disabled={result.page >= result.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </nav>
        ) : null}
      </main>
    </div>
  )
}
