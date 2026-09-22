import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { useReturnFocus } from '../lib/returnFocus'
import { createStory, updateStory } from '../stories/api'
import {
  STORY_STATUS_LABELS,
  STORY_STATUS_ORDER,
  StoryStatus,
  type StoryDetail,
  type StoryStatusValue,
} from '../stories/types'

interface StoryDraft {
  title: string
  premise: string
  status: StoryStatusValue
}

interface StoryFormProps {
  universeId: string
  /** The story being changed, or null when one is being started. */
  story: StoryDetail | null
  onClose: () => void
  onSaved: (story: StoryDetail) => void
}

/**
 * A story's title, premise and status, in the same drawer every Lorex form uses. Deliberately small:
 * a story is a title and what it is about, and its scenes are written on its own page.
 */
export function StoryForm({ universeId, story, onClose, onSaved }: StoryFormProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<StoryDraft>(() => ({
    title: story?.title ?? '',
    premise: story?.premise ?? '',
    status: story?.status ?? StoryStatus.Planning,
  }))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useReturnFocus()

  useEffect(() => {
    // showModal brings the focus trap, the backdrop and Escape with it.
    dialog.current?.showModal()
    title.current?.focus()
  }, [])

  function edit(change: Partial<StoryDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    const input = {
      title: draft.title.trim(),
      premise: draft.premise.trim() === '' ? null : draft.premise.trim(),
      status: draft.status,
    }

    try {
      const saved = story
        ? await updateStory(universeId, story.id, input)
        : await createStory(universeId, input)
      onSaved(saved)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage('That story could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="story-heading"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // Only a click on the backdrop itself lands on the dialog element.
        if (event.target === dialog.current) onClose()
      }}
      data-testid="story-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">{story ? 'Editing a story' : 'A new story'}</p>
          <h2 className="drawer__title" id="story-heading">
            {story ? story.title : 'New story'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="story-error">
              {message}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="story-title">
              Title
            </label>
            <input
              id="story-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder="The Long Winter"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="story-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="story-premise">
              Premise
            </label>
            <p className="field__hint">What the story is about. Optional.</p>
            <textarea
              id="story-premise"
              className="field__input field__input--area"
              rows={4}
              placeholder="A siege, told from its last day back to its first."
              value={draft.premise}
              onChange={(event) => edit({ premise: event.target.value })}
              aria-invalid={fieldErrors.premise ? true : undefined}
              data-testid="story-premise-input"
            />
            {fieldErrors.premise ? <p className="field__error">{fieldErrors.premise}</p> : null}
          </div>

          <div className="field">
            <span className="field__label" id="story-status-label">
              Status
            </span>
            <div className="kinds" role="group" aria-labelledby="story-status-label">
              {STORY_STATUS_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="kinds__step"
                  aria-pressed={draft.status === option}
                  onClick={() => edit({ status: option })}
                  data-testid={`story-status-${STORY_STATUS_LABELS[option].toLowerCase()}`}
                >
                  {STORY_STATUS_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="field__hint">
              Where you are with the telling. It says nothing about canon.
            </p>
            {fieldErrors.status ? <p className="field__error">{fieldErrors.status}</p> : null}
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-story">
            {isSaving ? 'Saving' : story ? 'Save story' : 'Create story'}
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={onClose}
            data-testid="cancel-story"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
