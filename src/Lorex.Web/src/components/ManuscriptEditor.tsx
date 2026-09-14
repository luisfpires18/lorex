import { useEffect, useId, useRef, useState } from 'react'
import { History, LocateFixed, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { ManuscriptHistory } from './ManuscriptHistory'
import { RecoveredDraft } from './RecoveredDraft'
import { SceneBeats, SceneLore, SceneStamp } from './SceneContext'
import { useAuth } from '../auth/useAuth'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useLocalDraft } from '../lib/useLocalDraft'
import { getSceneManuscript, MANUSCRIPT_CHANGED, saveSceneManuscript } from '../stories/api'
import { sceneWhen } from '../stories/format'
import type { SceneBeatReference } from '../stories/structure'
import { MANUSCRIPT_MAX_LENGTH, type Scene } from '../stories/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' } | { kind: 'error'; message: string }

/** The manuscript as the API last confirmed it: what "unsaved" is measured against, and what the next save names. */
interface Stored {
  content: string
  updatedAt: string | null
}

/** The stored moment a stale save's refusal reports, when it carries one. */
function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}

const count = new Intl.NumberFormat('en')

interface ManuscriptEditorProps {
  universeId: string
  storyId: string
  scene: Scene
  chronology: Chronology
  /** Where the scene is told: its container ("Chapter 2 — Arrival", none in a story without chapters) and "Scene 1 of 3". */
  where: { container: string | null; position: string }
  /** The plot beats that point at this scene. Shown only: the plot owns those links. */
  beats: SceneBeatReference[]
  /** Opens the scene's own form. Its planning is edited there, never here. */
  onEditScene: (scene: Scene) => void
}

/**
 * One scene's prose, and nothing but: a plain text box that keeps every line break, blank line and character exactly as
 * typed. No formatting, no Markdown and no reading of the text - a name written here links to nothing.
 *
 * Above it, read-only, the scene's planning as the Scenes view draws it - when and through whose eyes, its lore and its
 * beats, each a link to where it is edited - with Edit scene, which opens the scene's own drawer in place, Show in
 * Scenes, which leads back to the scene's place in the story's structure, and the manuscript's own history.
 *
 * Mounted once per scene - the panel keys it by the scene's id - so opening another scene starts from nothing and never
 * shows the last scene's prose under the new title while the new one loads.
 *
 * Saving is explicit: the Save button, or Ctrl+S / Cmd+S from anywhere on the page. The text is unsaved until the API
 * confirms it, so a failed save changes nothing on screen and can simply be tried again. A save over prose that was saved
 * from another tab or device since this one opened is refused by the API, and the author decides what happens next -
 * keep this text, or load that one. While anything is unsaved, following a link, signing out or leaving the page asks
 * first.
 *
 * Unsaved writing is also kept on this device as a recovery copy, never sent anywhere. If a scene opens with a copy that
 * differs from what is saved, the saved prose stays in the box, held, until the author recovers the copy or discards it.
 */
export function ManuscriptEditor({
  universeId,
  storyId,
  scene,
  chronology,
  where,
  beats,
  onEditScene,
}: ManuscriptEditorProps) {
  const sceneId = scene.id
  const titleId = useId()
  const editorId = useId()
  const statusId = useId()
  const tooLongId = useId()
  const recoveryId = useId()
  const historyId = useId()

  const { user } = useAuth()
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user ? { accountId: user.id, universeId, kind: 'manuscript', contentId: sceneId } : null,
  )

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>({ content: '', updatedAt: null })
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const shortcut = useRef<() => void>(() => {})

  useEffect(() => {
    const controller = new AbortController()

    getSceneManuscript(universeId, storyId, sceneId, controller.signal)
      .then((manuscript) => {
        setStored({ content: manuscript.content, updatedAt: manuscript.updatedAt })
        setDraft(manuscript.content)
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: 'This manuscript could not be opened.' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universeId, storyId, sceneId, reads])

  const isReady = load.kind === 'ready'
  const isDirty = isReady && draft !== stored.content
  const isTooLong = draft.length > MANUSCRIPT_MAX_LENGTH

  // A recovery copy that differs from what is saved is offered, and holds the writing until the author chooses. While the
  // copy is still being looked for the box waits too, so nothing typed can overwrite a copy nobody has seen yet.
  const offer = isReady && found && found.content !== stored.content ? found : null
  const isHeld = isReady && (offer !== null || found === undefined)

  // A copy identical to what is saved is nothing to recover: it goes without a word.
  useEffect(() => {
    if (isReady && found && found.content === stored.content) discard()
  }, [isReady, found, stored.content, discard])

  // The recovery copy follows the writing: kept while it differs from what is saved, let go once it does not.
  useEffect(() => {
    if (!isReady || isHeld) return
    if (isDirty) {
      keep(draft, stored.updatedAt)
    } else {
      forget()
    }
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  useLeaveGuard(
    isDirty ? `“${scene.title}” has unsaved changes. Leave without saving them?` : null,
    discard,
  )

  /** Saves the text as it stands, naming the stored manuscript it was written over. */
  async function save(expectedUpdatedAt: string | null) {
    if (inFlight.current || !isDirty || isTooLong) return

    const content = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(null)

    try {
      const saved = await saveSceneManuscript(universeId, storyId, sceneId, {
        content,
        expectedUpdatedAt,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored({ content: saved.content, updatedAt: saved.updatedAt })
      setHistoryKey((key) => key + 1)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === MANUSCRIPT_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(
          'This scene is no longer in the story — it may have been moved to the Trash in another window — so its manuscript could not be saved. Your text is still here: copy it before you leave.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.message)
      } else {
        setFailure('The manuscript could not be saved. Your text is still here — try again.')
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
      // Save disables itself while it works and again once nothing is unsaved, and a disabled button lets go of the
      // focus. Rather than leave it nowhere, it goes back to the prose.
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (!active || active === document.body) editor.current?.focus({ preventScroll: true })
      })
    }
  }

  // Ctrl+S / Cmd+S saves from anywhere while a scene is open - the outline, the tools, or after Save has let go of the
  // focus - and never opens the browser's "Save page". The listener reads the latest save through a ref, so it is
  // added once rather than on every keystroke.
  useEffect(() => {
    shortcut.current = () => void save(stored.updatedAt)
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcut.current()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function reread() {
    setConflict(null)
    setFailure(null)
    setLoad({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  /** Throws away this window's unsaved text for the version saved elsewhere - only once the author says so. */
  function loadSavedVersion() {
    if (
      !window.confirm(
        'Replace the text here with the version saved elsewhere? What you wrote here since your last save will be lost.',
      )
    ) {
      return
    }
    discard()
    reread()
  }

  /** Puts the recovery copy in the box as unsaved writing. Saving it is still the author's to do. */
  function recoverDraft() {
    if (!offer) return
    settle()
    setDraft(offer.content)
    setAnnouncement('The recovered draft is in the editor. It is not saved yet.')
    requestAnimationFrame(() => editor.current?.focus())
  }

  function discardDraft() {
    discard()
    setAnnouncement('The recovered draft was discarded. The saved manuscript is unchanged.')
    requestAnimationFrame(() => editor.current?.focus())
  }

  const hasContext =
    sceneWhen(chronology, scene.chronology) !== null ||
    scene.pov !== null ||
    scene.entities.length > 0 ||
    beats.length > 0

  const status = isSaving
    ? { state: 'saving', text: 'Saving…' }
    : isDirty
      ? { state: 'dirty', text: 'Unsaved changes' }
      : stored.updatedAt === null
        ? { state: 'empty', text: 'Nothing saved yet' }
        : { state: 'saved', text: 'Saved' }

  const describedBy = [statusId, isTooLong ? tooLongId : null, offer ? recoveryId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className="manuscript__editor"
      aria-labelledby={titleId}
      data-testid="manuscript-scene"
      data-title={scene.title}
    >
      <header className="manuscript__head">
        <p className="manuscript__where" data-testid="manuscript-where">
          {where.container ? `${where.container} · ` : null}
          <span className="manuscript__position">{where.position}</span>
        </p>
        <h4 className="manuscript__title" id={titleId} data-testid="manuscript-scene-title">
          {scene.title}
        </h4>

        {hasContext ? (
          <div className="manuscript__context">
            <SceneStamp
              universeId={universeId}
              chronology={chronology}
              scene={scene}
              testId="manuscript"
            />
            <SceneLore universeId={universeId} scene={scene} testId="manuscript" />
            <SceneBeats
              universeId={universeId}
              storyId={storyId}
              beats={beats}
              testId="manuscript"
            />
          </div>
        ) : null}

        <div className="storytools manuscript__tools">
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onEditScene(scene)}
            aria-describedby={titleId}
            data-testid="manuscript-edit-scene"
          >
            <ActionIcon icon={Pencil} />
            Edit scene
          </button>
          <Link
            className="button button--quiet button--icon"
            to={`/app/universes/${universeId}/stories/${storyId}#scene-${scene.id}`}
            aria-describedby={titleId}
            data-testid="manuscript-show-scene"
          >
            <ActionIcon icon={LocateFixed} />
            Show in Scenes
          </Link>
          {stored.updatedAt !== null || isHistoryOpen ? (
            <button
              className="button button--quiet button--icon"
              type="button"
              aria-expanded={isHistoryOpen}
              aria-controls={historyId}
              aria-describedby={titleId}
              onClick={() => setIsHistoryOpen((open) => !open)}
              data-testid="manuscript-history-toggle"
            >
              <ActionIcon icon={History} />
              Manuscript history
            </button>
          ) : null}
        </div>
      </header>

      {isHistoryOpen ? (
        <ManuscriptHistory
          id={historyId}
          universeId={universeId}
          storyId={storyId}
          sceneId={sceneId}
          reloadKey={historyKey}
          current={stored}
          blocked={
            !isReady
              ? 'Opening the manuscript…'
              : offer
                ? 'Recover or discard the recovered draft first.'
                : isDirty
                  ? 'Save your changes first: putting back a saved version would replace text that is not saved.'
                  : null
          }
          onRestored={(restored) => {
            setStored({ content: restored.content, updatedAt: restored.updatedAt })
            setDraft(restored.content)
            setHistoryKey((key) => key + 1)
          }}
          onStale={reread}
        />
      ) : null}

      {load.kind === 'loading' ? (
        <p className="notice" role="status" data-testid="manuscript-loading">
          Opening the manuscript…
        </p>
      ) : null}

      {load.kind === 'missing' ? (
        <div className="empty" data-testid="manuscript-missing">
          <p className="empty__line">This scene is not here.</p>
          <p className="empty__hint">It may have been moved to the Trash.</p>
        </div>
      ) : null}

      {load.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="manuscript-load-error">
          <p>{load.message}</p>
          <button
            className="button button--quiet"
            type="button"
            onClick={reread}
            data-testid="manuscript-retry"
          >
            Try again
          </button>
        </div>
      ) : null}

      {isReady ? (
        <>
          {offer ? (
            <div id={recoveryId} className="manuscript__recovery">
              <RecoveredDraft
                what="this scene's manuscript"
                draft={offer}
                savedUpdatedAt={stored.updatedAt}
                preview={
                  offer.content === '' ? (
                    <p className="entry__blank">No text in this draft.</p>
                  ) : (
                    <div
                      className="recovery__prose"
                      role="region"
                      aria-label="Text of the recovered draft"
                      tabIndex={0}
                    >
                      {offer.content}
                    </div>
                  )
                }
                onRecover={recoverDraft}
                onDiscard={discardDraft}
                testId="manuscript-recovery"
              />
            </div>
          ) : null}

          {conflict ? (
            <div className="manuscript__conflict" role="alert" data-testid="manuscript-conflict">
              <p className="manuscript__conflicttext">
                This manuscript was saved somewhere else — another tab or device — after you opened
                it here. Nothing was overwritten, and your text below is not saved.
              </p>
              <div className="manuscript__conflictactions">
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void save(conflict.updatedAt)}
                  data-testid="manuscript-keep-mine"
                >
                  Save mine over it
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={isSaving}
                  onClick={loadSavedVersion}
                  data-testid="manuscript-load-saved"
                >
                  Load the saved version
                </button>
              </div>
            </div>
          ) : null}

          {failure ? (
            <p
              className="form__message manuscript__failure"
              role="alert"
              data-testid="manuscript-error"
            >
              {failure}
            </p>
          ) : null}

          <label className="visually-hidden" htmlFor={editorId}>
            Manuscript of “{scene.title}”
          </label>
          <textarea
            ref={editor}
            id={editorId}
            className="manuscript__text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            readOnly={isHeld}
            placeholder="Write the scene."
            spellCheck
            aria-describedby={describedBy}
            aria-invalid={isTooLong ? true : undefined}
            aria-keyshortcuts="Control+S Meta+S"
            data-testid="manuscript-editor"
            data-held={isHeld ? 'true' : 'false'}
          />

          <div className="manuscript__bar">
            <p
              className="manuscript__status"
              id={statusId}
              role="status"
              data-state={status.state}
              data-testid="manuscript-status"
            >
              {status.text}
            </p>
            {isTooLong ? (
              <p
                className="field__error manuscript__toolong"
                id={tooLongId}
                data-testid="manuscript-too-long"
              >
                Too long to save: {count.format(draft.length)} of{' '}
                {count.format(MANUSCRIPT_MAX_LENGTH)} characters. Split it into more scenes.
              </p>
            ) : null}
            {failed && isDirty ? (
              <p
                className="recovery__warning"
                role="status"
                data-testid="manuscript-recovery-warning"
              >
                This device could not keep a recovery copy of these changes. Save to keep them.
              </p>
            ) : null}
            <button
              className="button"
              type="button"
              disabled={!isDirty || isSaving || isTooLong}
              onClick={() => void save(stored.updatedAt)}
              aria-describedby={statusId}
              aria-keyshortcuts="Control+S Meta+S"
              data-testid="manuscript-save"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : null}

      <p className="visually-hidden" role="status" data-testid="manuscript-announcer">
        {announcement}
      </p>
    </section>
  )
}
