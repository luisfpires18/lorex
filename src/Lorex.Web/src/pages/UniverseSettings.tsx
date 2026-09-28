import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ChronologySettings } from '../components/ChronologySettings'
import { PUBLIC_PORTAL_SECTION_ID, PublicPortalSettings } from '../components/PublicPortalSettings'
import { UniverseForm } from '../components/UniverseForm'
import { downloadUniverseBackup } from '../export/api'
import { discardUniverseDrafts } from '../lib/localDrafts'
import { getPublication } from '../publishing/api'
import { Visibility } from '../publishing/types'
import { deleteUniverse, setUniverseArchived, updateUniverse } from '../universes/api'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'

export default function UniverseSettings() {
  const { universe, refresh, chronology, setChronology } = useOutletContext<WorkspaceContext>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [isPublic, setIsPublic] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const archiveConfirm = useRef<HTMLDivElement>(null)
  const archiveButton = useRef<HTMLButtonElement>(null)
  const deleteConfirm = useRef<HTMLDivElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const hadDeleteConfirm = useRef(false)

  // A confirmation takes the focus when it opens; closing it hands the focus back to what opened it.
  // Cancel hands the focus back to Archive universe, which is only mounted again after the render.
  const archiveCancelled = useRef(false)
  useEffect(() => {
    if (confirmingArchive) {
      archiveConfirm.current?.focus()
    } else if (archiveCancelled.current) {
      archiveCancelled.current = false
      archiveButton.current?.focus()
    }
  }, [confirmingArchive])

  useEffect(() => {
    if (confirmingDelete) {
      hadDeleteConfirm.current = true
      deleteConfirm.current?.focus()
    } else if (hadDeleteConfirm.current) {
      hadDeleteConfirm.current = false
      deleteButton.current?.focus()
    }
  }, [confirmingDelete])

  const [exporting, setExporting] = useState(false)
  const [exportedAs, setExportedAs] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  async function exportBackup() {
    setExporting(true)
    setExportedAs(null)
    setExportError(null)
    try {
      setExportedAs(await downloadUniverseBackup(universe.id))
    } catch (problem: unknown) {
      setExportError(
        problem instanceof Error ? problem.message : 'That backup could not be prepared.',
      )
    } finally {
      setExporting(false)
    }
  }

  async function toggleArchived() {
    setBusy(true)
    setError(null)
    try {
      refresh(await setUniverseArchived(universe.id, !universe.isArchived))
      setConfirmingArchive(false)
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : 'That could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Archive and publication are separate (ADR 0036): an archived universe that is public stays public until its author
   * makes it private. So archiving a public universe asks first and says so, read fresh from the server, rather than
   * letting "archived" be mistaken for "taken down". Restoring from the archive changes nothing public and never asks.
   */
  async function askToArchive() {
    if (universe.isArchived) {
      await toggleArchived()
      return
    }
    setBusy(true)
    setError(null)
    let publicNow: boolean | null = null
    try {
      publicNow = (await getPublication(universe.id)).visibility === Visibility.Public
      setIsPublic(publicNow)
    } catch {
      // Unknown: ask anyway rather than archive a possibly public universe without a word.
    }
    if (publicNow === false) {
      await toggleArchived()
      return
    }
    setConfirmingArchive(true)
    setBusy(false)
  }

  function goToPublicPortal() {
    setConfirmingArchive(false)
    const section = document.getElementById(PUBLIC_PORTAL_SECTION_ID)
    section?.scrollIntoView({ block: 'start' })
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteUniverse(universe.id)
      // Nothing is left to recover unsaved writing into, so this device lets the universe's recovery copies go too.
      if (user) void discardUniverseDrafts(user.id, universe.id).catch(() => undefined)
      await navigate('/app', { replace: true })
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : 'That could not be deleted.')
      setBusy(false)
    }
  }

  return (
    <article className="settings">
      <PageHeader title="Settings" />

      <section className="settings__section">
        <h2 className="settings__heading">Details</h2>
        {saved ? (
          <p className="settings__saved" role="status" data-testid="settings-saved">
            Saved.
          </p>
        ) : null}
        <UniverseForm
          key={universe.updatedAt}
          initial={{
            name: universe.name,
            description: universe.description,
            accentColor: universe.accentColor,
          }}
          submitLabel="Save changes"
          busyLabel="Saving"
          onSubmit={async (input) => {
            const updated = await updateUniverse(universe.id, input)
            refresh(updated)
            setSaved(true)
          }}
        />
      </section>

      <PublicPortalSettings universeId={universe.id} onVisibilityChange={setIsPublic} />

      <ChronologySettings
        universeId={universe.id}
        chronology={chronology}
        onSaved={setChronology}
      />

      <section className="settings__section">
        <h2 className="settings__heading">Backup</h2>
        <p className="settings__note">
          Download this universe as a single archive: its entries and their articles, types and
          fields, tags, relationships, the timeline, its world rules, every entry&rsquo;s history,
          and the full-size image of every entry that has one, the ideas that belong to this
          universe, and its public details and artwork. Nothing about your account is in it - so
          ideas that belong to no universe are in no universe&rsquo;s backup - and neither is
          whether it is public: a restored universe is always private. Keep the file somewhere you
          trust.
        </p>
        <p className="settings__note">
          A backup is restored as a new universe beside this one - never over it.{' '}
          <Link to="/app?restore" data-testid="settings-restore-link">
            Restore a backup
          </Link>
        </p>
        <button
          className="button button--secondary"
          type="button"
          onClick={exportBackup}
          disabled={exporting}
          data-testid="export-universe"
        >
          {exporting ? 'Preparing backup' : 'Download backup'}
        </button>
        {exportedAs ? (
          <p className="settings__saved" role="status" data-testid="export-done">
            Saved as {exportedAs}.
          </p>
        ) : null}
        {exportError ? (
          <p className="form__message" role="alert" data-testid="export-error">
            {exportError}
          </p>
        ) : null}
      </section>

      <section className="settings__section" data-testid="archive-section">
        <h2 className="settings__heading">{universe.isArchived ? 'Restore' : 'Archive'}</h2>
        <p className="settings__note">
          {universe.isArchived
            ? 'This universe is archived. Restoring puts it back in your active list.'
            : 'Archiving keeps everything and takes the universe out of your active list. It does not change whether the universe is public.'}
        </p>
        {universe.isArchived && isPublic ? (
          <p className="settings__note" data-testid="archived-still-public">
            <strong>Still public.</strong> Archiving does not take a universe off the public portal.{' '}
            <button className="linkbutton" type="button" onClick={goToPublicPortal}>
              Make it private in Public portal
            </button>{' '}
            to remove its public page.
          </p>
        ) : null}
        {confirmingArchive ? (
          <div
            className="settings__confirm"
            role="group"
            aria-labelledby="archive-confirm-title"
            tabIndex={-1}
            ref={archiveConfirm}
            data-testid="archive-public-confirm"
          >
            <p className="settings__confirmtitle" id="archive-confirm-title">
              {isPublic ? (
                <>
                  Archive <bdi>{universe.name}</bdi>? It stays public.
                </>
              ) : (
                <>
                  Archive <bdi>{universe.name}</bdi>?
                </>
              )}
            </p>
            <p className="settings__note">
              {isPublic
                ? 'Archiving only takes it out of your active list. Its public page, its place in Explore and everything you published in it stay available to anyone until you make it private in Public portal.'
                : 'Lorex could not check whether this universe is public. Archiving never changes that: if it is public, it stays public until you make it private in Public portal.'}
            </p>
            <div className="form__actions">
              <button
                className="button"
                type="button"
                onClick={() => void toggleArchived()}
                disabled={busy}
                data-testid="confirm-archive"
              >
                {busy ? 'Archiving' : isPublic ? 'Archive, keep public' : 'Archive universe'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={goToPublicPortal}
                data-testid="archive-go-private"
              >
                Make it private first
              </button>
              <button
                className="button button--text"
                type="button"
                onClick={() => {
                  archiveCancelled.current = true
                  setConfirmingArchive(false)
                }}
                data-testid="cancel-archive"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={archiveButton}
            className="button button--secondary"
            type="button"
            onClick={() => void askToArchive()}
            disabled={busy}
            data-testid="toggle-archive"
          >
            {universe.isArchived ? 'Restore universe' : 'Archive universe'}
          </button>
        )}
      </section>

      {universe.isArchived ? (
        <section
          className="settings__section settings__section--danger"
          aria-labelledby="danger-heading"
          data-testid="danger-section"
        >
          <h2 className="settings__heading" id="danger-heading">
            Delete universe
          </h2>
          <p className="settings__note">
            Deleting removes this universe and everything in it, for good. There is no undo and no
            Trash for it.{isPublic ? ' Its public page goes with it.' : null}
          </p>
          <p className="settings__note" data-testid="delete-ideas-note">
            Your ideas about it are kept: they belong to your account, so they stay in Ideas with no
            universe, and only their references to this universe&rsquo;s content go.
          </p>
          {confirmingDelete ? (
            <div
              className="settings__confirm"
              role="group"
              aria-labelledby="delete-confirm-title"
              tabIndex={-1}
              ref={deleteConfirm}
            >
              <p className="settings__confirmtitle" id="delete-confirm-title">
                Delete <bdi>{universe.name}</bdi> permanently?
              </p>
              <div className="form__actions">
                <button
                  className="button button--danger"
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  data-testid="confirm-delete"
                >
                  Delete permanently
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              ref={deleteButton}
              className="button button--secondary button--danger-quiet"
              type="button"
              onClick={() => setConfirmingDelete(true)}
              data-testid="delete-universe"
            >
              Delete universe…
            </button>
          )}
        </section>
      ) : null}

      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  )
}
