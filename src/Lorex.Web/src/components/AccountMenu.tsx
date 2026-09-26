import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { confirmLeaving } from '../lib/leaveGuard'
import { useProfileImage } from '../profile/useProfileImage'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { Avatar } from './Avatar'

/**
 * The account, everywhere: a circular avatar that opens onto who you are, your profile and the way
 * out.
 *
 * One component for the two places account access belongs - the workspace's black rail and the
 * universes header - and for the folded mobile bar, which is the same rail. Not two lookalikes:
 * the avatar, the photo, the fallback, the keyboard behaviour and the wording have one
 * implementation, and `variant` only says which surface it is drawn on.
 *
 * The opening, closing and keyboard behaviour is `ActionMenu`'s, the same as every other menu in
 * Lorex: a disclosure of ordinary links and buttons, opened by a click or a tap, closed by Escape
 * (focus back on the trigger) or by a press outside.
 *
 * The avatar comes from `useProfileImage`, so every one of these and the Profile screen show the
 * same photo the moment it changes - see `ProfileImageProvider`.
 */
export function AccountMenu({ variant }: { variant: 'rail' | 'bar' }) {
  const { user, logOut } = useAuth()
  const { image } = useProfileImage()
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)

  // Signed out there is no account, and no menu. The guarded routes never render this, but the
  // check keeps it honest for anything that later does.
  const signedIn = user !== null

  async function signOut() {
    // A way out of whatever is open, and a button rather than a link, so the leave guard's link check never sees it.
    if (!confirmLeaving()) return

    setBusy(true)
    try {
      await logOut()
      await navigate('/login', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (!signedIn) return null

  return (
    <div className={`accountmenu accountmenu--${variant}`} data-testid="account-menu">
      {variant === 'bar' ? (
        // A label beside the circle on a wide header, where there is room for it and a bare
        // avatar would be the only unlabelled thing in the bar. Hidden on a narrow one.
        <span className="accountmenu__name" data-testid="signed-in-user">
          {user.username}
        </span>
      ) : null}

      <ActionMenu
        label="Open account menu"
        trigger={<Avatar image={image} name={user.username} className="accountmenu__avatar" />}
        triggerClassName="accountmenu__trigger"
        panelClassName="accountmenu__panel"
        triggerTestId="account-menu-trigger"
        panelTestId="account-menu-panel"
      >
        <div className="actionmenu__context">
          <p className="accountmenu__username">{user.username}</p>
          <p className="accountmenu__email">{user.email}</p>
        </div>

        <Link className="actionmenu__item" to="/app/profile" data-testid="account-menu-profile">
          <ActionIcon icon={UserRound} />
          View profile
        </Link>

        {/* Stays open while it works, so "Signing out" is seen where the press was. */}
        <button
          className="actionmenu__item"
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          data-keep-open
          data-testid="account-menu-signout"
        >
          <ActionIcon icon={LogOut} />
          {busy ? 'Signing out' : 'Sign out'}
        </button>
      </ActionMenu>
    </div>
  )
}
