import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { formatDate } from '../lib/dates'
import { ROLE_LABELS } from '../universes/access'
import {
  acceptInvitation,
  declineInvitation,
  listMyInvitations,
  type ReceivedInvitation,
} from '../universes/collaborators'

/**
 * My workspace's invitations: universes someone has invited this account's email address to. Only shown while there is
 * one - an empty section would be a promise of something that is not there. Accepting opens the universe; declining
 * takes the row away and says so. Nothing here was sent by email: Lorex sends none, and finds these by the address.
 */
export function ReceivedInvitations() {
  const navigate = useNavigate()
  const [invitations, setInvitations] = useState<ReceivedInvitation[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listMyInvitations(controller.signal)
      .then(setInvitations)
      // A list that could not be read is the same as an empty one here: the universes below are what the page is for.
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [])

  async function accept(invitation: ReceivedInvitation) {
    setBusy(invitation.id)
    setError(null)
    try {
      const accepted = await acceptInvitation(invitation.id)
      await navigate(`/app/universes/${accepted.universeId}`)
    } catch (problem: unknown) {
      setBusy(null)
      fail(invitation, problem)
    }
  }

  async function decline(invitation: ReceivedInvitation) {
    setBusy(invitation.id)
    setError(null)
    try {
      await declineInvitation(invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setAnnouncement(`Invitation to ${invitation.universeName} declined.`)
    } catch (problem: unknown) {
      fail(invitation, problem)
    } finally {
      setBusy(null)
    }
  }

  function fail(invitation: ReceivedInvitation, problem: unknown) {
    // Gone since the page was opened - revoked, expired, or answered in another tab: it is simply not offered any more.
    if (problem instanceof ApiError && (problem.status === 404 || problem.status === 410)) {
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setAnnouncement(`The invitation to ${invitation.universeName} is no longer available.`)
      return
    }
    setError({
      id: invitation.id,
      message: problem instanceof Error ? problem.message : 'That could not be done. Try again.',
    })
  }

  return (
    <>
      <p className="visually-hidden" role="status" data-testid="invitations-announcer">
        {announcement}
      </p>
      {invitations.length > 0 ? (
        <section
          className="invitations"
          aria-labelledby="invitations-heading"
          data-testid="received-invitations"
        >
          <h2 className="invitations__heading" id="invitations-heading">
            Invitations
          </h2>
          <ul className="invitations__list">
            {invitations.map((invitation) => (
              <li
                className="invitations__item"
                key={invitation.id}
                data-testid="received-invitation"
              >
                <div className="invitations__what">
                  <p className="invitations__name">
                    <bdi>{invitation.universeName}</bdi>
                  </p>
                  <p className="invitations__role">
                    Invited as {ROLE_LABELS[invitation.role]}
                    <span className="invitations__expires">
                      {' '}
                      · until {formatDate(invitation.expiresAt)}
                    </span>
                  </p>
                </div>
                <div className="invitations__actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void accept(invitation)}
                    disabled={busy !== null}
                    aria-describedby={`invitation-${invitation.id}`}
                    data-testid="accept-invitation"
                  >
                    {busy === invitation.id ? 'Accepting' : 'Accept'}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => void decline(invitation)}
                    disabled={busy !== null}
                    aria-describedby={`invitation-${invitation.id}`}
                    data-testid="decline-invitation"
                  >
                    Decline
                  </button>
                </div>
                <span className="visually-hidden" id={`invitation-${invitation.id}`}>
                  {invitation.universeName}
                </span>
                {error?.id === invitation.id ? (
                  <p className="form__message invitations__error" role="alert">
                    {error.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
