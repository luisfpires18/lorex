import { useEffect, useId, useState } from 'react'
import { formatBytes } from '../lib/bytes'
import { getAccountStorage } from '../profile/api'
import type { AccountStorage } from '../profile/types'

/**
 * The Profile's Storage section: how much of the account's allowance its pictures use (ADR 0042).
 *
 * One read when the Profile opens - never per picture or per card. Read only: there is nothing to buy or raise here,
 * so nothing offers to. The bar is a meter with its words beside it, and the full state is said in a sentence rather
 * than left to a colour.
 *
 * Like the universe count above it, a nicety on this screen rather than its subject: if storage cannot be read the
 * section is left out rather than the page failing over it.
 */
export function AccountStorageSection() {
  const headingId = useId()
  const [storage, setStorage] = useState<AccountStorage | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    getAccountStorage(controller.signal)
      .then(setStorage)
      .catch(() => setStorage(null))

    return () => {
      controller.abort()
    }
  }, [])

  if (!storage) return null

  const used = formatBytes(storage.usedBytes)
  const quota = formatBytes(storage.quotaBytes)
  const full = storage.usedBytes >= storage.quotaBytes
  const percent = Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100))

  // Something stored is never drawn as an empty bar, however small it is next to the allowance.
  const drawn = storage.usedBytes > 0 ? Math.max(percent, 1) : 0

  return (
    <section
      className="profile__public storage"
      aria-labelledby={headingId}
      data-testid="profile-storage"
    >
      <h2 className="profile__subtitle" id={headingId}>
        Storage
      </h2>

      <p className="storage__amount" data-testid="profile-storage-amount">
        {used} used of {quota}
      </p>

      <div
        className="progressbar storage__meter"
        role="meter"
        aria-labelledby={headingId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${used} used of ${quota}`}
        data-state={full ? 'full' : undefined}
        data-testid="profile-storage-meter"
      >
        <span className="progressbar__fill" style={{ width: `${drawn}%` }} />
      </div>

      {full ? (
        <p className="storage__full" data-testid="profile-storage-full">
          Your storage is full. Remove some images to add new ones.
        </p>
      ) : null}

      <p className="settings__note">
        Images on Lore entries in universes you own count here, including entries in the Trash and
        images your collaborators add.
      </p>
    </section>
  )
}
