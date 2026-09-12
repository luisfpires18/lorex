import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Wordmark } from '../components/Wordmark'
import { listUniverses } from '../universes/api'

/** The first character the account actually carries, so an emoji or a non-Latin name survives. */
function monogram(name: string) {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

/**
 * The signed-in account, and only what Lorex genuinely knows about it.
 *
 * A user-level screen rather than a universe one: nothing here belongs to a world, so it sits
 * beside the universe browser at `/app/profile` and wears the same bar. The workspace sidebar
 * still links to it, which is where an author is when they think to look.
 *
 * There is no stored picture and no display name in the auth model, so the circle carries an
 * initial and the page says as much rather than offering an upload that goes nowhere.
 */
export default function ProfilePage() {
  const { user, logOut } = useAuth()
  const navigate = useNavigate()

  const [universeCount, setUniverseCount] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    // A count is a nicety on this screen, not its subject: if it cannot be read the row is
    // left out rather than the page failing over it.
    listUniverses({ search: '', includeArchived: true, page: 1 }, controller.signal)
      .then((page) => setUniverseCount(page.totalCount))
      .catch(() => setUniverseCount(null))

    return () => {
      controller.abort()
    }
  }, [])

  async function handleLogOut() {
    await logOut()
    await navigate('/login', { replace: true })
  }

  // RequireAuth holds this route, so a signed-out visitor never reaches this render.
  if (!user) return null

  return (
    <div className="home">
      <header className="home__bar">
        <Wordmark />
        <div className="home__session">
          <Link className="home__back" to="/app">
            All universes
          </Link>
          <button className="button button--quiet" type="button" onClick={handleLogOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="home__body">
        <article className="profile" data-testid="profile">
          <h1 className="profile__title">Profile</h1>

          {/* Decorative: it is the initial of the name printed directly underneath it, and a
              screen reader that read both would only say the same letter twice. */}
          <span className="profile__avatar" data-testid="profile-avatar" aria-hidden="true">
            {monogram(user.username)}
          </span>

          <p className="profile__name" data-testid="profile-name">
            {user.username}
          </p>

          <dl className="profile__facts">
            <div className="profile__fact">
              <dt className="profile__label">Email</dt>
              <dd className="profile__value" data-testid="profile-email">
                {user.email}
              </dd>
            </div>
            {universeCount === null ? null : (
              <div className="profile__fact">
                <dt className="profile__label">Universes</dt>
                <dd className="profile__value" data-testid="profile-universes">
                  {universeCount}
                </dd>
              </div>
            )}
            <div className="profile__fact">
              <dt className="profile__label">Account ID</dt>
              <dd className="profile__value profile__value--id" data-testid="profile-id">
                {user.id}
              </dd>
            </div>
          </dl>

          <p className="profile__note">
            Lorex keeps only what it needs to sign you in: a username and an email address. There is
            no profile picture to upload yet, so the circle above carries your initial.
          </p>
        </article>
      </main>
    </div>
  )
}
