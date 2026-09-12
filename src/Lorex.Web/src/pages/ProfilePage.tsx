import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { Wordmark } from '../components/Wordmark'
import { getProfileImage } from '../profile/api'
import type { ProfileImageRef } from '../profile/types'
import { listUniverses } from '../universes/api'

/**
 * The signed-in account, and only what Lorex genuinely knows about it.
 *
 * A user-level screen rather than a universe one: nothing here belongs to a world, so it sits
 * beside the universe browser at `/app/profile` and wears the same bar. The workspace sidebar
 * still links to it, which is where an author is when they think to look.
 *
 * The circle near the top is the account's photo, or its initial when there is none. There is no
 * display name in the auth model, so the username is the name, and the page shows only what Lorex
 * genuinely holds rather than fields it would have to invent.
 */
export default function ProfilePage() {
  const { user, logOut } = useAuth()
  const navigate = useNavigate()

  const [universeCount, setUniverseCount] = useState<number | null>(null)
  const [image, setImage] = useState<ProfileImageRef | null>(null)

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

  useEffect(() => {
    const controller = new AbortController()

    // A photo that cannot be read leaves the monogram standing, which is the same thing an
    // account without one shows. Nothing here is worth failing the page over.
    getProfileImage(controller.signal)
      .then(setImage)
      .catch(() => setImage(null))

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

          <ProfileAvatar name={user.username} image={image} onChanged={setImage} />

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
            Lorex keeps only what it needs to sign you in: a username, an email address, and the
            photo above if you add one. Your photo is private - it is served only to your own
            signed-in session, and it is never part of a universe backup.
          </p>
        </article>
      </main>
    </div>
  )
}
