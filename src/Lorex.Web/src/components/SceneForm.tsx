import { useEffect, useRef, useState } from 'react'
import {
  ChronologyPointFields,
  type ChronologyPointDraft,
  type ChronologyPointPart,
} from './ChronologyPointFields'
import { EntityMultiPicker, EntityPicker, type EntityChoice } from './EntityPicker'
import { namesEras } from '../chronology/format'
import type { Chronology, ChronologyValue } from '../chronology/types'
import { ApiError } from '../lib/api'
import { createScene, updateScene } from '../stories/api'
import type { Scene, SceneLoreReference } from '../stories/types'

const EMPTY_POINT: ChronologyPointDraft = { eraId: '', year: '', month: '', day: '' }

interface SceneDraft {
  title: string
  summary: string
  notes: string
  pov: EntityChoice | null
  point: ChronologyPointDraft
  entities: EntityChoice[]
}

/**
 * A reference as the pickers hold it. An entry in the Trash keeps its place - the form posts every
 * reference back, so dropping it would delete it on the next save - and says why it is unavailable.
 */
function choiceOf(reference: SceneLoreReference): EntityChoice {
  return {
    id: reference.entityId,
    name: reference.isTrashed ? `${reference.name} (in Trash)` : reference.name,
  }
}

function numberText(value: number | null) {
  return value === null ? '' : String(value)
}

function draftFrom(scene: Scene | null): SceneDraft {
  if (!scene) {
    return { title: '', summary: '', notes: '', pov: null, point: EMPTY_POINT, entities: [] }
  }

  return {
    title: scene.title,
    summary: scene.summary ?? '',
    notes: scene.notes ?? '',
    pov: scene.pov ? choiceOf(scene.pov) : null,
    point: scene.chronology
      ? {
          eraId: scene.chronology.eraId ?? '',
          year: numberText(scene.chronology.year),
          month: numberText(scene.chronology.month),
          day: numberText(scene.chronology.day),
        }
      : EMPTY_POINT,
    entities: scene.entities.map(choiceOf),
  }
}

/** An empty box is no claim at all; anything unreadable is left for the API to refuse. */
function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

/** Nothing typed at all is a scene not placed in time. Anything typed is sent as it stands. */
function chronologyOf(point: ChronologyPointDraft, reckonsInEras: boolean): ChronologyValue | null {
  if (Object.values(point).every((part) => part.trim() === '')) return null

  return {
    eraId: reckonsInEras ? trimmed(point.eraId) : null,
    year: toNumber(point.year),
    month: toNumber(point.month),
    day: toNumber(point.day),
  }
}

interface SceneFormProps {
  universeId: string
  storyId: string
  /** The scene being changed, or null for a new one - which is always appended. */
  scene: Scene | null
  chronology: Chronology
  onClose: () => void
  onSaved: (scene: Scene) => void
}

/**
 * A scene's title, summary, notes, point of view, place in the world and linked lore, in the drawer
 * every Lorex form uses.
 *
 * Nothing here decides where the scene is told: a new scene goes last and only the story page moves
 * it. The chronology is where it happens in the world, and the form says so, because a nonlinear
 * story is a valid one. The pickers search live lore only, so nothing in the Trash can be newly
 * chosen.
 */
export function SceneForm({
  universeId,
  storyId,
  scene,
  chronology,
  onClose,
  onSaved,
}: SceneFormProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<SceneDraft>(() => draftFrom(scene))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const reckonsInEras = namesEras(chronology)
  const hasPoint = Object.values(draft.point).some((part) => part.trim() !== '')

  // A plain year written before the universe named its eras has no era to show in the picker.
  const unreckoned = reckonsInEras && scene?.chronology != null && scene.chronology.eraId === null

  useEffect(() => {
    dialog.current?.showModal()
    title.current?.focus()
  }, [])

  function edit(change: Partial<SceneDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function setPart(part: ChronologyPointPart, value: string) {
    setDraft((current) => ({ ...current, point: { ...current.point, [part]: value } }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    const input = {
      title: draft.title.trim(),
      summary: trimmed(draft.summary),
      notes: trimmed(draft.notes),
      povEntityId: draft.pov?.id ?? null,
      chronology: chronologyOf(draft.point, reckonsInEras),
      entityIds: draft.entities.map((choice) => choice.id),
    }

    try {
      const saved = scene
        ? await updateScene(universeId, storyId, scene.id, input)
        : await createScene(universeId, storyId, input)
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
        setMessage('That scene could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="scene-heading"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
      data-testid="scene-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">{scene ? 'Editing a scene' : 'A new scene'}</p>
          <h2 className="drawer__title" id="scene-heading">
            {scene ? scene.title : 'New scene'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="scene-error">
              {message}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="scene-title">
              Title
            </label>
            <input
              id="scene-title"
              className="field__input"
              ref={title}
              type="text"
              placeholder="The Council"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="scene-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="scene-summary">
              Summary
            </label>
            <p className="field__hint">What happens, briefly.</p>
            <textarea
              id="scene-summary"
              className="field__input field__input--area"
              rows={3}
              value={draft.summary}
              onChange={(event) => edit({ summary: event.target.value })}
              aria-invalid={fieldErrors.summary ? true : undefined}
              data-testid="scene-summary-input"
            />
            {fieldErrors.summary ? <p className="field__error">{fieldErrors.summary}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="scene-notes">
              Notes
            </label>
            <p className="field__hint">Your own planning notes. Only shown here.</p>
            <textarea
              id="scene-notes"
              className="field__input field__input--area"
              rows={4}
              value={draft.notes}
              onChange={(event) => edit({ notes: event.target.value })}
              aria-invalid={fieldErrors.notes ? true : undefined}
              data-testid="scene-notes-input"
            />
            {fieldErrors.notes ? <p className="field__error">{fieldErrors.notes}</p> : null}
          </div>

          <div data-testid="scene-pov-field">
            <EntityPicker
              label="Point of view"
              universeId={universeId}
              value={draft.pov}
              onChange={(pov) => edit({ pov })}
              placeholder="Anyone or anything in this universe"
              error={fieldErrors.poventityid}
            />
          </div>

          <fieldset className="scenechron">
            <legend className="field__label">When in the world</legend>
            <p className="field__hint">
              Optional. Where this scene happens, not where it is told — it never moves the scene.
            </p>

            <ChronologyPointFields
              chronology={chronology}
              ids={{
                eraId: 'scene-eraId',
                year: 'scene-year',
                month: 'scene-month',
                day: 'scene-day',
              }}
              value={draft.point}
              onChange={setPart}
              errors={{
                eraId: fieldErrors['chronology.eraid'],
                year: fieldErrors['chronology.year'],
                month: fieldErrors['chronology.month'],
                day: fieldErrors['chronology.day'],
              }}
            />

            {unreckoned ? (
              <p className="field__hint" data-testid="scene-unreckoned">
                Placed as a plain year before this universe named its eras. Choose its era, or clear
                it.
              </p>
            ) : null}

            {hasPoint ? (
              <button
                className="button button--quiet scenechron__clear"
                type="button"
                onClick={() => edit({ point: EMPTY_POINT })}
                data-testid="scene-chronology-clear"
              >
                Clear when
              </button>
            ) : null}
          </fieldset>

          <div data-testid="scene-lore-field">
            <EntityMultiPicker
              label="Linked lore"
              hint="Lore relevant to this scene. Linking says nothing about who is there."
              universeId={universeId}
              value={draft.entities}
              onChange={(entities) => edit({ entities })}
              error={fieldErrors.entityids}
            />
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-scene">
            {isSaving ? 'Saving' : scene ? 'Save scene' : 'Add scene'}
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={onClose}
            data-testid="cancel-scene"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
