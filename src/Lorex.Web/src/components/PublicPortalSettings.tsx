import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { worldPath } from '../portal/api'
import { getPublication, publishUniverse, unpublishUniverse } from '../publishing/api'
import {
  REQUIREMENTS,
  Visibility,
  categoryLabel,
  genreLabel,
  type PublicationState,
} from '../publishing/types'
import { PublicDetailsForm } from './PublicDetailsForm'
import { UniverseArtworkField } from './UniverseArtworkField'

/** What the everything-else list names, so an author knows exactly what publishing leaves private. */
const STAYS_PRIVATE =
  'Any lore entry or story you have not published on its own page, notes, ideas, the timeline, world rules, relationships, Canon, the Trash, and everything else you edit in the workspace.'

type Confirming = { kind: 'publish'; state: PublicationState } | { kind: 'unpublish' }

/**
 * Settings' Public portal section: whether this universe can be seen outside the workspace, and everything its
 * public card needs (ADR 0036).
 *
 * The visibility is stated in words, never only a colour. Publishing is an explicit act with a confirmation that
 * lists exactly what becomes public and what does not, read fresh from the server when it opens so it names what
 * is saved; it is refused - with the missing things listed - until everything is there, and it will not publish
 * over unsaved public details. Making it private again is deliberate too, and calm about it.
 */
export function PublicPortalSettings({ universeId }: { universeId: string }) {
  const headingId = useId()
  const [state, setState] = useState<PublicationState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailsDirty, setDetailsDirty] = useState(false)
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string[] | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const problemRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    (signal?: AbortSignal) =>
      getPublication(universeId, signal)
        .then((next) => {
          setState(next)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setLoadError(
            error instanceof Error ? error.message : 'The public details could not be loaded.',
          )
        }),
    [universeId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  // The confirmation takes the focus when it opens, and a refusal does when it appears.
  useEffect(() => {
    if (confirming) panel.current?.focus()
  }, [confirming])

  useEffect(() => {
    if (problem) problemRef.current?.focus()
  }, [problem])

  if (loadError) {
    return (
      <section className="settings__section" aria-labelledby={headingId}>
        <h2 className="settings__heading" id={headingId}>
          Public portal
        </h2>
        <div className="notice notice--error" role="alert">
          <p>{loadError}</p>
          <button className="button button--secondary" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </section>
    )
  }

  if (!state) {
    return (
      <section className="settings__section" aria-labelledby={headingId}>
        <h2 className="settings__heading" id={headingId}>
          Public portal
        </h2>
        <p className="notice" role="status">
          Loading the public details…
        </p>
      </section>
    )
  }

  const isPublic = state.visibility === Visibility.Public
  const missing = REQUIREMENTS.filter((requirement) => requirement.key in state.missing)

  async function askToPublish() {
    setProblem(null)
    setAnnouncement(null)

    if (detailsDirty) {
      setProblem(['Save the public details first: a universe is published with what is saved.'])
      return
    }

    setBusy(true)
    try {
      // Fresh, so the confirmation names exactly what is saved - including a name changed above.
      const fresh = await getPublication(universeId)
      setState(fresh)

      const stillMissing = REQUIREMENTS.filter((requirement) => requirement.key in fresh.missing)
      if (stillMissing.length > 0) {
        setProblem(stillMissing.map((requirement) => fresh.missing[requirement.key][0]))
        return
      }

      setConfirming({ kind: 'publish', state: fresh })
    } catch (error: unknown) {
      setProblem([error instanceof Error ? error.message : 'That could not be checked. Try again.'])
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    setProblem(null)
    try {
      const next = await publishUniverse(universeId)
      setState(next)
      setConfirming(null)
      setAnnouncement('Published. This universe can now appear in the public portal.')
    } catch (error: unknown) {
      setConfirming(null)
      setProblem(
        error instanceof ApiError && Object.keys(error.fieldErrors).length > 0
          ? Object.values(error.fieldErrors)
          : [error instanceof Error ? error.message : 'It could not be published. Try again.'],
      )
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function unpublish() {
    setBusy(true)
    setProblem(null)
    try {
      setState(await unpublishUniverse(universeId))
      setConfirming(null)
      setAnnouncement('Made private. Its public page is no longer available.')
    } catch (error: unknown) {
      setProblem([
        error instanceof Error ? error.message : 'It could not be made private. Try again.',
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="settings__section publication"
      aria-labelledby={headingId}
      data-testid="public-portal"
    >
      <h2 className="settings__heading" id={headingId}>
        Public portal
      </h2>

      <p className="publication__state" data-testid="publication-status">
        <span className="publication__badge" data-state={isPublic ? 'public' : 'private'}>
          {isPublic ? 'Public' : 'Private'}
        </span>{' '}
        {isPublic
          ? 'This universe can appear in Lorex’s public portal.'
          : 'This universe is visible only inside your Lorex workspace.'}
      </p>
      <p className="settings__note">
        Publishing this universe does not publish its lore entries or stories: each one is published
        from its own page, and is seen only while this universe is public.
      </p>

      {isPublic && state.publicSlug ? (
        <p className="publication__address" data-testid="publication-address">
          <span className="publication__label">Public page</span>{' '}
          <Link to={worldPath(state.publicSlug)} data-testid="view-public-page">
            View public page
          </Link>{' '}
          <span className="publication__path">{worldPath(state.publicSlug)}</span>
        </p>
      ) : null}

      <h3 className="publication__heading">Public details</h3>
      <PublicDetailsForm
        universeId={universeId}
        state={state}
        onSaved={setState}
        onDirtyChange={setDetailsDirty}
      />

      <h3 className="publication__heading">Artwork</h3>
      <UniverseArtworkField
        universeId={universeId}
        artwork={state.artwork}
        isPublic={isPublic}
        onChanged={() => void load()}
      />

      <h3 className="publication__heading">Public author</h3>
      {state.authorDisplayName ? (
        <p className="settings__note" data-testid="publication-author">
          Published as <bdi>{state.authorDisplayName}</bdi>.{' '}
          <Link to="/app/profile">Change your public name</Link>
        </p>
      ) : (
        <p className="settings__note" data-testid="publication-author">
          You have no public name yet. <Link to="/app/profile">Choose one on your profile</Link> -
          it is shown as the author of what you publish; your username and email never are.
        </p>
      )}

      <h3 className="publication__heading">Publishing</h3>

      {!isPublic ? (
        <ul
          className="publication__checklist"
          aria-label="What publishing needs"
          data-testid="publication-checklist"
        >
          {REQUIREMENTS.map((requirement) => {
            const needed = requirement.key in state.missing
            return (
              <li key={requirement.key} data-state={needed ? 'needed' : 'done'}>
                <span className="publication__mark" aria-hidden="true">
                  {needed ? '○' : '✓'}
                </span>
                {requirement.label}
                <span className="publication__word">{needed ? ' - needed' : ' - done'}</span>
              </li>
            )
          })}
        </ul>
      ) : null}

      {problem ? (
        <div
          className="callout callout--warning publication__problem"
          role="alert"
          tabIndex={-1}
          ref={problemRef}
          data-testid="publication-problem"
        >
          <p className="callout__title">Not published yet</p>
          <ul className="publication__missing">
            {problem.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {announcement ? (
        <p className="settings__saved" role="status" data-testid="publication-announcement">
          {announcement}
        </p>
      ) : null}

      {confirming?.kind === 'publish' ? (
        <div
          className="publication__confirm"
          role="group"
          aria-labelledby={`${headingId}-confirm`}
          tabIndex={-1}
          ref={panel}
          data-testid="publish-confirm"
        >
          <h4 className="publication__confirmtitle" id={`${headingId}-confirm`}>
            Publish <bdi>{confirming.state.name}</bdi>?
          </h4>
          <p className="settings__note">Anyone will be able to see:</p>
          <dl className="publication__facts">
            <div>
              <dt>Title</dt>
              <dd>
                <bdi>{confirming.state.name}</bdi>
              </dd>
            </div>
            <div>
              <dt>Public summary</dt>
              <dd className="prose">{confirming.state.publicSummary}</dd>
            </div>
            <div>
              <dt>Artwork</dt>
              <dd>Its card, as shown above</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{confirming.state.category ? categoryLabel(confirming.state.category) : ''}</dd>
            </div>
            <div>
              <dt>Genres</dt>
              <dd>{confirming.state.genres.map(genreLabel).join(', ')}</dd>
            </div>
            <div>
              <dt>Author</dt>
              <dd>
                <bdi>{confirming.state.authorDisplayName}</bdi>
              </dd>
            </div>
          </dl>
          <p className="settings__note">
            <strong>Not published:</strong> {STAYS_PRIVATE}
          </p>
          <div className="form__actions">
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => void publish()}
              data-testid="confirm-publish"
            >
              {busy ? 'Publishing' : 'Publish universe'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              Keep private
            </button>
          </div>
        </div>
      ) : null}

      {confirming?.kind === 'unpublish' ? (
        <div
          className="publication__confirm"
          role="group"
          aria-labelledby={`${headingId}-confirm`}
          tabIndex={-1}
          ref={panel}
          data-testid="unpublish-confirm"
        >
          <h4 className="publication__confirmtitle" id={`${headingId}-confirm`}>
            Make <bdi>{state.name}</bdi> private?
          </h4>
          <p className="settings__note">
            Its public page and its place in Explore stop being available straight away. Its public
            details stay here, and its address is kept for when you publish it again.
          </p>
          <div className="form__actions">
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => void unpublish()}
              data-testid="confirm-unpublish"
            >
              {busy ? 'Making private' : 'Make private'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              Keep public
            </button>
          </div>
        </div>
      ) : null}

      {confirming === null ? (
        <div className="form__actions">
          {isPublic ? (
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setProblem(null)
                setAnnouncement(null)
                setConfirming({ kind: 'unpublish' })
              }}
              data-testid="unpublish"
            >
              Make private…
            </button>
          ) : (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => void askToPublish()}
              data-testid="publish"
            >
              Publish…
            </button>
          )}
        </div>
      ) : null}

      {!isPublic && missing.length === 0 && !detailsDirty && !confirming ? (
        <p className="field__hint">Everything a public card needs is here.</p>
      ) : null}
    </section>
  )
}
