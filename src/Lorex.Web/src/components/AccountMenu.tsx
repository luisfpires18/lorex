import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { confirmLeaving } from '../lib/leaveGuard'
import { useProfileImage } from '../profile/useProfileImage'
import { ActionIcon } from './ActionIcon'
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
 * A disclosure rather than an ARIA menu, deliberately. What drops down is a link and a button, and
 * native roles are what a screen reader, a browser's own shortcuts and a test all already
 * understand - `role="menu"` would take the link's role away and buy nothing here. So: a trigger
 * that says whether it is open and what it controls, and a panel of ordinary controls that Tab
 * walks in order.
 *
 * Click or tap opens - never hover, which has no equivalent on a phone and traps a keyboard.
 * Escape closes and hands focus back to the trigger; a pointer press outside closes; opening moves
 * focus into the panel so the keyboard is not left behind the trigger it just pressed.
 *
 * The avatar comes from `useProfileImage`, so every one of these and the Profile screen show the
 * same photo the moment it changes - see `ProfileImageProvider`.
 */
export function AccountMenu({ variant }: { variant: 'rail' | 'bar' }) {
  const { user, logOut } = useAuth()
  const { image } = useProfileImage()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const firstItem = useRef<HTMLAnchorElement>(null)

  // Signed out there is no account, and no menu. The guarded routes never render this, but the
  // check keeps it honest for anything that later does.
  const signedIn = user !== null

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // Stops the key reaching a dialog or the page behind: closing this is what Escape meant.
      event.stopPropagation()
      close()
    }

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }

    // Pointer-down rather than click, so a press that starts outside closes immediately rather
    // than on release - and so a press on the trigger itself is left to the trigger.
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    // Into the panel on opening, so the first thing Tab or a screen reader meets is its contents.
    if (open) firstItem.current?.focus()
  }, [open])

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
    <div className={`accountmenu accountmenu--${variant}`} ref={root} data-testid="account-menu">
      {variant === 'bar' ? (
        // A label beside the circle on a wide header, where there is room for it and a bare
        // avatar would be the only unlabelled thing in the bar. Hidden on a narrow one.
        <span className="accountmenu__name" data-testid="signed-in-user">
          {user.username}
        </span>
      ) : null}

      <button
        className="accountmenu__trigger"
        type="button"
        ref={trigger}
        aria-label="Open account menu"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-testid="account-menu-trigger"
      >
        <Avatar image={image} name={user.username} className="accountmenu__avatar" />
      </button>

      {open ? (
        <div className="accountmenu__panel" id={panelId} data-testid="account-menu-panel">
          <div className="accountmenu__who">
            <p className="accountmenu__username">{user.username}</p>
            <p className="accountmenu__email">{user.email}</p>
          </div>

          <Link
            className="accountmenu__item"
            to="/app/profile"
            ref={firstItem}
            onClick={() => setOpen(false)}
            data-testid="account-menu-profile"
          >
            <ActionIcon icon={UserRound} />
            View profile
          </Link>

          <button
            className="accountmenu__item"
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            data-testid="account-menu-signout"
          >
            <ActionIcon icon={LogOut} />
            {busy ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
