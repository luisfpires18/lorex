import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { UniverseForm } from '../components/UniverseForm'
import { downloadUniverseBackup } from '../export/api'
import { discardUniverseDrafts } from '../lib/localDrafts'
import { getPublication } from '../publishing/api'
import { Visibility } from '../publishing/types'
import { deleteUniverse, setUniverseArchived, updateUniverse } from '../universes/api'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'data', label: 'Data' },
  { id: 'advanced', label: 'Advanced' },
] as const

type TabId = (typeof TABS)[number]['id']

const isTab = (value: string | null): value is TabId => TABS.some((tab) => tab.id === value)

/**
 * A universe's Settings (UI refinement 014): four tabs in a centred column rather than one long page. Publishing has a
 * page of its own, Publish, and the chronology is worldbuilding, not configuration - it is its own section, Chronology.
 *
 * General is the universe's name and description; Appearance its colour (the author's own, no palette; Lorex's Light and
 * Dark theme is the account's, not a universe's); Data its backup and restore; Advanced its archive
 * and, once archived, delete - the one thing that cannot be taken back, set apart in the danger panel.
 *
 * Every panel stays mounted and is only hidden, so an unsaved form keeps its text and its leave guard across tab
 * changes, and switching tabs is never a departure. The chosen tab is in the address (`?tab=`) so it can be linked to,
 * but switching replaces rather than adds a history entry: Back leaves Settings, as it always has.
 */
export default function UniverseSettings() {
  const { universe, refresh } = useOutletContext<WorkspaceContext>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab: TabId = isTab(asked) ? asked : 'general'
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>())
  const tabList = useRef<HTMLDivElement>(null)

  // On a phone the tab row scrolls sideways: keep the chosen tab in it, without moving the page.
  useEffect(() => {
    const list = tabList.current
    const chosen = tabRefs.current.get(tab)
    if (!list || !chosen) return
    const start = chosen.offsetLeft - list.offsetLeft
    const end = start + chosen.offsetWidth
    if (start < list.scrollLeft) list.scrollLeft = start
    else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth
  }, [tab])

  function choose(next: TabId, focus = false) {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (next === 'general') copy.delete('tab')
        else copy.set('tab', next)
        return copy
      },
      { replace: true },
    )
    if (focus) tabRefs.current.get(next)?.focus()
  }

  // The tab pattern's keys: arrows move and choose, Home and End jump.
  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const at = TABS.findIndex((each) => each.id === tab)
    const to =
      event.key === 'ArrowRight'
        ? (at + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : -1
    if (to < 0) return
    event.preventDefault()
    choose(TABS[to].id, true)
  }

  const [savedDetails, setSavedDetails] = useState(false)
  const [savedColour, setSavedColour] = useState(false)
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

  // Whether the universe is public, for the archive's words. Publication itself is on Publish.
  useEffect(() => {
    const controller = new AbortController()
    getPublication(universe.id, controller.signal)
      .then((state) => setIsPublic(state.visibility === Visibility.Public))
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [universe.id])

  // A confirmation takes the focus when it opens; Cancel hands the focus back to what opened it, which is only mounted
  // again after the render.
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

  const publishPath = `/app/universes/${universe.id}/publish`

  return (
    <article className="settings settings--tabbed">
      <PageHeader title="Settings" />

      <div
        ref={tabList}
        className="tabs"
        role="tablist"
        aria-label="Settings"
        onKeyDown={onTabKey}
        data-testid="settings-tabs"
      >
        {TABS.map((each) => (
          <button
            key={each.id}
            ref={(node) => {
              if (node) tabRefs.current.set(each.id, node)
              else tabRefs.current.delete(each.id)
            }}
            className="tabs__tab"
            type="button"
            role="tab"
            id={`settings-tab-${each.id}`}
            aria-selected={tab === each.id}
            aria-controls={`settings-panel-${each.id}`}
            tabIndex={tab === each.id ? 0 : -1}
            onClick={() => choose(each.id)}
            data-testid={`settings-tab-${each.id}`}
          >
            {each.label}
          </button>
        ))}
      </div>

      <Panel id="general" tab={tab}>
        <section className="settings__section">
          <h2 className="settings__heading">Details</h2>
          {savedDetails ? (
            <p className="settings__saved" role="status" data-testid="settings-saved">
              Saved.
            </p>
          ) : null}
          <UniverseForm
            key={`${universe.name}\u0000${universe.description ?? ''}`}
            fields="details"
            initial={{
              name: universe.name,
              description: universe.description,
              accentColor: universe.accentColor,
            }}
            submitLabel="Save changes"
            busyLabel="Saving"
            onSubmit={async (input) => {
              // The colour is Appearance's: what is stored now, never what this form opened on.
              const updated = await updateUniverse(universe.id, {
                ...input,
                accentColor: universe.accentColor,
              })
              refresh(updated)
              setSavedDetails(true)
            }}
          />
        </section>
      </Panel>

      <Panel id="appearance" tab={tab}>
        <section className="settings__section">
          <h2 className="settings__heading">Colour</h2>
          <p className="settings__note">
            Light or dark is chosen for all of Lorex from your account menu, not per universe.
          </p>
          {savedColour ? (
            <p className="settings__saved" role="status" data-testid="settings-colour-saved">
              Saved.
            </p>
          ) : null}
          <UniverseForm
            key={universe.accentColor ?? ''}
            fields="colour"
            initial={{
              name: universe.name,
              description: universe.description,
              accentColor: universe.accentColor,
            }}
            submitLabel="Save colour"
            busyLabel="Saving"
            onSubmit={async (input) => {
              const updated = await updateUniverse(universe.id, {
                name: universe.name,
                description: universe.description,
                accentColor: input.accentColor,
              })
              refresh(updated)
              setSavedColour(true)
            }}
          />
        </section>
      </Panel>

      <Panel id="data" tab={tab}>
        <section className="settings__section">
          <h2 className="settings__heading">Backup</h2>
          <p className="settings__note">
            One archive of this universe: its lore and articles, types, relationships, timeline,
            world rules, history, pictures, its ideas and its public details. No account data, and
            not whether it is public - a restored universe is always private.
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

        <section className="settings__section">
          <h2 className="settings__heading">Restore</h2>
          <p className="settings__note">
            A backup is restored as a new universe beside this one - never over it.
          </p>
          <Link
            className="button button--secondary"
            to="/app?restore"
            data-testid="settings-restore-link"
          >
            Restore a backup
          </Link>
        </section>
      </Panel>

      <Panel id="advanced" tab={tab}>
        <section className="settings__section" data-testid="archive-section">
          <h2 className="settings__heading">{universe.isArchived ? 'Restore' : 'Archive'}</h2>
          <p className="settings__note">
            {universe.isArchived
              ? 'This universe is archived. Restoring puts it back in your active list.'
              : 'Archiving keeps everything and takes the universe out of your active list. It does not change whether the universe is public.'}
          </p>
          {universe.isArchived && isPublic ? (
            <p className="settings__note" data-testid="archived-still-public">
              <strong>Still public.</strong> Archiving does not take a universe off the public
              portal. <Link to={publishPath}>Make it private on Publish</Link> to remove its public
              page.
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
                  ? 'Archiving only takes it out of your active list. Its public page, its place in Explore and everything you published in it stay available to anyone until you make it private on Publish.'
                  : 'Lorex could not check whether this universe is public. Archiving never changes that: if it is public, it stays public until you make it private on Publish.'}
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
                <Link
                  className="button button--secondary"
                  to={publishPath}
                  data-testid="archive-go-private"
                >
                  Make it private first
                </Link>
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
              Your ideas about it are kept: they belong to your account, so they stay in Ideas with
              no universe, and only their references to this universe&rsquo;s content go.
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
        ) : (
          <p className="settings__note" data-testid="delete-needs-archive">
            To delete this universe, archive it first.
          </p>
        )}

        {error ? (
          <p className="form__message" role="alert">
            {error}
          </p>
        ) : null}
      </Panel>
    </article>
  )
}

/** One tab's panel: always mounted, hidden unless chosen, so what is typed in it is kept. */
function Panel({ id, tab, children }: { id: TabId; tab: TabId; children: ReactNode }) {
  return (
    <div
      className="tabs__panel"
      role="tabpanel"
      id={`settings-panel-${id}`}
      aria-labelledby={`settings-tab-${id}`}
      hidden={tab !== id}
      tabIndex={0}
      data-testid={`settings-panel-${id}`}
    >
      {children}
    </div>
  )
}
