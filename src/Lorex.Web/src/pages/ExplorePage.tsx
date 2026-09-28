import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams, type SetURLSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { EmptyState } from '../components/EmptyState'
import {
  listPublicUniverses,
  worldPath,
  type ExploreQuery,
  type PublicUniverse,
} from '../portal/api'
import heroImage from '../portal/explore-worlds-background.png'
import { CATEGORIES, categoryLabel, GENRES, genreLabel } from '../publishing/types'

/** The API's own limit on a search, so the field cannot ask for something it would refuse. */
const SEARCH_MAX = 100
/** Long enough to let a word be typed, short enough that results follow the typing. */
const SEARCH_PAUSE_MS = 300

type Results =
  | {
      key: string
      kind: 'ready'
      items: PublicUniverse[]
      page: number
      totalCount: number
      totalPages: number
    }
  | { key: string; kind: 'error' }

/**
 * Explore: the public portal's front page. One question - what worlds can I explore? - answered with the
 * universes their authors have published, one card each, and nothing invented: no metrics, no featured row, no
 * placeholder worlds (ADR 0036).
 *
 * <p>Discovery lives in the address, so a filtered Explore can be shared, refreshed and walked with Back and
 * Forward: `q`, `category`, `genre` and `sort=az`, each left out when it is the default. The API does the
 * filtering, over the public fields only. More results arrive with "Show more worlds" rather than an endless
 * scroll: a button is reachable, finite and says what it will do. The pages loaded that way are not in the
 * address - a refresh starts from the first page again, with the same filters.</p>
 */
export default function ExplorePage() {
  const [params, setParams] = useSearchParams()

  // Only keys Lorex knows. A stale or hand-edited address shows everything rather than an error.
  const category = CATEGORIES.find((option) => option.key === params.get('category'))?.key
  const genre = GENRES.find((option) => option.key === params.get('genre'))?.key
  const sort = params.get('sort') === 'az' ? ('az' as const) : undefined
  const q = (params.get('q') ?? '').trim().slice(0, SEARCH_MAX)
  const query: ExploreQuery = { category, genre, q: q || undefined, sort }
  const queryKey = JSON.stringify(query)
  const isFiltered = Boolean(category || genre || q)

  const [attempt, setAttempt] = useState(0)
  const fetchKey = `${queryKey}#${attempt}`
  const [results, setResults] = useState<Results | null>(null)
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle')
  const moreRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    moreRequest.current?.abort()
    listPublicUniverses(JSON.parse(queryKey) as ExploreQuery, 1, controller.signal)
      .then((page) => {
        setMore('idle')
        setResults({ key: fetchKey, kind: 'ready', ...page })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setResults({ key: fetchKey, kind: 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [queryKey, fetchKey])

  // Anything not for the current address is stale: the address changed, so the answer is still coming.
  const current = results?.key === fetchKey ? results : null
  const ready = current?.kind === 'ready' ? current : null

  function showMore() {
    if (!ready) return
    const controller = new AbortController()
    moreRequest.current = controller
    setMore('loading')
    listPublicUniverses(query, ready.page + 1, controller.signal)
      .then((page) => {
        setMore('idle')
        setResults((was) => {
          if (was?.key !== fetchKey || was.kind !== 'ready') return was
          // Something published meanwhile shifts every later page by one; the slug keeps a world from appearing twice.
          const seen = new Set(was.items.map((world) => world.slug))
          return {
            ...was,
            items: [...was.items, ...page.items.filter((world) => !seen.has(world.slug))],
            page: page.page,
            totalCount: page.totalCount,
            totalPages: page.totalPages,
          }
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setMore('error')
      })
  }

  function clearAll() {
    setParams(new URLSearchParams())
  }

  return (
    <div className="explore" data-testid="explore">
      <section className="explore-hero" aria-labelledby="explore-title">
        <img
          className="explore-hero__image"
          src={heroImage}
          alt=""
          width={1916}
          height={821}
          fetchPriority="high"
          decoding="async"
        />
        <div className="explore-hero__inner">
          <h1 className="explore-hero__title" id="explore-title">
            Explore worlds
          </h1>
          <p className="explore-hero__lede">
            Universes their authors have chosen to share. Find one by its name, its author or what
            it is about.
          </p>
          <SearchField q={q} setParams={setParams} />
        </div>
      </section>

      <div className="explore__body">
        <div className="explore-filters">
          <nav className="explore-cats" aria-label="Categories">
            <ul className="explore-cats__list">
              {[{ key: undefined, label: 'All' }, ...CATEGORIES].map((option) => (
                <li key={option.label}>
                  <Link
                    className="explore-cats__chip"
                    to={{ search: withParam(params, 'category', option.key) }}
                    aria-current={option.key === category ? 'true' : undefined}
                    data-testid={`explore-category-${option.key ?? 'all'}`}
                  >
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="explore-filters__selects">
            <label className="explore-select">
              <span className="explore-select__label">Genre</span>
              <select
                className="explore-select__control"
                value={genre ?? ''}
                onChange={(event) =>
                  setParams(withParam(params, 'genre', event.target.value || undefined))
                }
                data-testid="explore-genre"
              >
                <option value="">All genres</option>
                {GENRES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="explore-select">
              <span className="explore-select__label">Sort</span>
              <select
                className="explore-select__control"
                value={sort ?? 'recent'}
                onChange={(event) =>
                  setParams(
                    withParam(params, 'sort', event.target.value === 'az' ? 'az' : undefined),
                  )
                }
                data-testid="explore-sort"
              >
                <option value="recent">Recently published</option>
                <option value="az">A–Z</option>
              </select>
            </label>
          </div>
        </div>

        <p className="explore__count" role="status" data-testid="explore-count">
          {current === null
            ? 'Finding worlds…'
            : ready
              ? countLine(ready.items.length, ready.totalCount, isFiltered)
              : ''}
        </p>

        <h2 className="visually-hidden">Worlds</h2>

        {current === null ? (
          <ul className="explore-grid" aria-hidden="true" data-testid="explore-loading">
            {Array.from({ length: 8 }, (_, index) => (
              <li className="worldcard worldcard--skeleton" key={index}>
                <span className="worldcard__art" />
                <span className="worldcard__text">
                  <span className="worldcard__bone worldcard__bone--name" />
                  <span className="worldcard__bone" />
                  <span className="worldcard__bone worldcard__bone--short" />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {current?.kind === 'error' ? (
          <div
            className="notice notice--error explore__error"
            role="alert"
            data-testid="explore-error"
          >
            <p>The published worlds could not be loaded. Check your connection and try again.</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
            >
              Try again
            </button>
          </div>
        ) : null}

        {ready && ready.items.length === 0 && !isFiltered ? (
          <EmptyState
            testId="explore-empty"
            title="No worlds have been published yet."
            hint="When an author makes a universe public, it appears here."
          />
        ) : null}

        {ready && ready.items.length === 0 && isFiltered ? (
          <EmptyState
            testId="explore-no-match"
            title="No published worlds match."
            hint="Try another word, category or genre - or see every world."
            action={
              <button className="button button--secondary" type="button" onClick={clearAll}>
                Clear search and filters
              </button>
            }
          />
        ) : null}

        {ready && ready.items.length > 0 ? (
          <ul className="explore-grid" data-testid="explore-list">
            {ready.items.map((world) => (
              <WorldCard key={world.slug} world={world} />
            ))}
          </ul>
        ) : null}

        {ready && ready.page < ready.totalPages ? (
          <div className="explore__more">
            {more === 'error' ? (
              <p className="explore__more-error" role="alert">
                More worlds could not be loaded.
              </p>
            ) : null}
            <button
              className="button button--secondary explore__more-button"
              type="button"
              onClick={showMore}
              disabled={more === 'loading'}
              aria-busy={more === 'loading'}
              data-testid="explore-more"
            >
              {more === 'loading'
                ? 'Loading worlds…'
                : more === 'error'
                  ? 'Try again'
                  : 'Show more worlds'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The search field. What is typed is sent after a short pause - or at once on Enter, and at once when it is
 * emptied - so the address and the results follow a word, not every keystroke. Refining a search replaces the
 * history entry; starting or clearing one adds an entry, so Back returns to the unsearched page.
 */
function SearchField({ q, setParams }: { q: string; setParams: SetURLSearchParams }) {
  const [draft, setDraft] = useState(q)
  const [draftFor, setDraftFor] = useState(q)

  // Back, Forward or a filter reset changed the address: the field shows what the address now says - unless it
  // already does, give or take the spaces still being typed.
  if (draftFor !== q) {
    setDraftFor(q)
    if (draft.trim() !== q) setDraft(q)
  }

  useEffect(() => {
    if (draft.trim() === q || draft.trim() === '') return
    const timer = window.setTimeout(() => commitSearch(draft, q, setParams), SEARCH_PAUSE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [draft, q, setParams])

  return (
    <form
      className="explore-search"
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        commitSearch(draft, q, setParams)
      }}
    >
      <label className="visually-hidden" htmlFor="explore-q">
        Search worlds
      </label>
      <Search className="explore-search__icon" aria-hidden="true" size={20} strokeWidth={1.75} />
      <input
        className="explore-search__input"
        id="explore-q"
        type="search"
        placeholder="Search worlds and authors"
        value={draft}
        maxLength={SEARCH_MAX}
        autoComplete="off"
        dir="auto"
        onChange={(event) => {
          setDraft(event.target.value)
          if (event.target.value.trim() === '') commitSearch('', q, setParams)
        }}
        data-testid="explore-search"
      />
      {draft ? (
        <button
          className="explore-search__clear"
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft('')
            commitSearch('', q, setParams)
            document.getElementById('explore-q')?.focus()
          }}
          data-testid="explore-search-clear"
        >
          <X aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      ) : null}
    </form>
  )
}

/**
 * One public universe as a card: its artwork, name, category and genres, and its author. The whole card is one
 * link to its page - nothing else inside it is interactive. If the picture cannot be shown, the card keeps its
 * shape with the Lorex mark rather than borrowing anyone's art.
 */
function WorldCard({ world }: { world: PublicUniverse }) {
  const [broken, setBroken] = useState(false)

  return (
    <li className="worldcard">
      <Link className="worldcard__link" to={worldPath(world.slug)}>
        <div className="worldcard__art">
          {broken ? (
            <span className="worldcard__fallback" data-testid="worldcard-fallback">
              <BrandMark className="worldcard__mark" />
            </span>
          ) : (
            <img
              className="worldcard__image"
              src={world.cardImageUrl}
              alt=""
              width={960}
              height={600}
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
            />
          )}
        </div>
        <div className="worldcard__text">
          <h3 className="worldcard__name" dir="auto" title={world.name}>
            <bdi>{world.name}</bdi>
          </h3>
          <p className="worldcard__facts">
            <span className="worldcard__category">{categoryLabel(world.category)}</span> ·{' '}
            {world.genres.map(genreLabel).join(', ')}
          </p>
          <p className="worldcard__author">
            by <bdi>{world.authorDisplayName}</bdi>
          </p>
        </div>
      </Link>
    </li>
  )
}

/** Puts a search into the address. Refining one replaces the entry; starting or clearing one adds an entry. */
function commitSearch(value: string, q: string, setParams: SetURLSearchParams) {
  const next = value.trim().slice(0, SEARCH_MAX)
  if (next === q) return
  setParams(
    (was) => {
      const now = new URLSearchParams(was)
      if (next) now.set('q', next)
      else now.delete('q')
      return now
    },
    { replace: Boolean(q) && Boolean(next) },
  )
}

/** The current address with one parameter set, or removed when it would be the default. */
function withParam(params: URLSearchParams, name: string, value: string | undefined) {
  const next = new URLSearchParams(params)
  if (value) next.set(name, value)
  else next.delete(name)
  const search = next.toString()
  return search ? `?${search}` : ''
}

function countLine(shown: number, total: number, isFiltered: boolean) {
  // Nothing to count: the empty state below says so, once.
  if (total === 0) return ''
  const worlds = total === 1 ? 'world' : 'worlds'
  if (shown < total) return `Showing ${shown} of ${total} ${worlds}`
  return isFiltered ? `${total} ${worlds} match` : `${total} ${worlds}`
}
