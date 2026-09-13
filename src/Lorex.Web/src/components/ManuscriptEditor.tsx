import { useEffect, useId, useRef, useState } from 'react'
import { LocateFixed, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { SceneBeats, SceneLore, SceneStamp } from './SceneContext'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
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
 * beats, each a link to where it is edited - with Edit scene, which opens the scene's own drawer in place, and Show in
 * Scenes, which leads back to the scene's place in the story's structure.
 *
 * Mounted once per scene - the panel keys it by the scene's id - so opening another scene starts from nothing and never
 * shows the last scene's prose under the new title while the new one loads.
 *
 * Saving is explicit: the Save button, or Ctrl+S / Cmd+S from anywhere on the page. The text is unsaved until the API
 * confirms it, so a failed save changes nothing on screen and can simply be tried again. A save over prose that was saved
 * from another tab or device since this one opened is refused by the API, and the author decides what happens next -
 * keep this text, or load that one. While anything is unsaved, following a link, signing out or leaving the page asks
 * first.
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

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>({ content: '', updatedAt: null })
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
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

  useLeaveGuard(isDirty ? `“${scene.title}” has unsaved changes. Leave without saving them?` : null)

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
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === MANUSCRIPT_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(
          'This scene is no longer in the story, so its manuscript could not be saved. Your text is still here — copy it before you leave.',
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
    reread()
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
        </div>
      </header>

      {load.kind === 'loading' ? (
        <p className="notice" role="status" data-testid="manuscript-loading">
          Opening the manuscript…
        </p>
      ) : null}

      {load.kind === 'missing' ? (
        <div className="empty" data-testid="manuscript-missing">
          <p className="empty__line">This scene is not here.</p>
          <p className="empty__hint">It may have been deleted.</p>
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
            placeholder="Write the scene."
            spellCheck
            aria-describedby={isTooLong ? `${statusId} ${tooLongId}` : statusId}
            aria-invalid={isTooLong ? true : undefined}
            aria-keyshortcuts="Control+S Meta+S"
            data-testid="manuscript-editor"
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
    </section>
  )
}
