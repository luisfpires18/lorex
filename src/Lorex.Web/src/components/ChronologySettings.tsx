import { useEffect, useRef, useState } from 'react'
import { CanonBlockNotice } from './CanonBlockNotice'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { getChronology, saveChronology } from '../chronology/api'
import { previewYears } from '../chronology/format'
import {
  EraDirection,
  EraLabelPosition,
  type Chronology,
  type ChronologyInput,
  type EraDirectionValue,
  type EraLabelPositionValue,
} from '../chronology/types'
import { ApiError } from '../lib/api'

/** One era as it is being edited. Text stays text until it is sent; counts ride along for display. */
interface EraDraft {
  /** Stable across reordering, so React keeps each row's inputs with its era. */
  key: string
  id: string | null
  name: string
  abbreviation: string
  direction: EraDirectionValue
  labelPosition: EraLabelPositionValue
  momentCount: number
  yearCount: number
  sceneCount: number
}

function draftsFrom(chronology: Chronology): EraDraft[] {
  return chronology.eras.map((era) => ({
    key: era.id,
    id: era.id,
    name: era.name,
    abbreviation: era.abbreviation ?? '',
    direction: era.direction,
    labelPosition: era.labelPosition,
    momentCount: era.momentCount,
    yearCount: era.yearCount,
    sceneCount: era.sceneCount,
  }))
}

function inputOf(drafts: EraDraft[]): ChronologyInput {
  return {
    eras: drafts.map((era) => ({
      id: era.id,
      name: era.name.trim(),
      abbreviation: era.abbreviation.trim() || null,
      direction: era.direction,
      labelPosition: era.labelPosition,
    })),
  }
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`
}

function usageOf(era: EraDraft) {
  const parts: string[] = []
  if (era.momentCount > 0) parts.push(plural(era.momentCount, 'timeline entry', 'timeline entries'))
  if (era.yearCount > 0) parts.push(plural(era.yearCount, 'year on an entry', 'years on entries'))
  if (era.sceneCount > 0) parts.push(plural(era.sceneCount, 'scene', 'scenes'))
  return parts.length === 0 ? null : `Dates ${parts.join(' and ')}`
}

interface ChronologySettingsProps {
  universeId: string
  chronology: Chronology
  onSaved: (next: Chronology) => void
}

/**
 * Where a universe's eras are named, ordered and turned the right way round.
 *
 * The whole list is saved at once, so reordering two eras is one change rather than a moment
 * where both sit in the same place. An era something is dated in cannot be removed here - the
 * button says so rather than letting the API refuse it - and a change that would make settled
 * canon contradict itself comes back as the same refusal every gated form shows.
 */
export function ChronologySettings({ universeId, chronology, onSaved }: ChronologySettingsProps) {
  const [stored, setStored] = useState(chronology)
  const [drafts, setDrafts] = useState(() => draftsFrom(chronology))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const touched = useRef(false)
  const created = useRef(0)

  // The workspace read the chronology when the universe opened. How much is dated in each era
  // may have moved since, so this screen asks again - without trampling an edit already begun.
  useEffect(() => {
    const controller = new AbortController()

    getChronology(universeId, controller.signal)
      .then((fresh) => {
        setStored(fresh)
        if (!touched.current) setDrafts(draftsFrom(fresh))
        onSaved(fresh)
      })
      .catch(() => {
        // The workspace's copy stands in; saving still reports anything that has moved.
      })

    return () => {
      controller.abort()
    }
  }, [universeId, onSaved])

  const dirty = JSON.stringify(inputOf(drafts)) !== JSON.stringify(inputOf(draftsFrom(stored)))

  function change(next: EraDraft[]) {
    touched.current = true
    setDrafts(next)
    setSaved(false)
  }

  function update(index: number, part: Partial<EraDraft>) {
    change(drafts.map((era, position) => (position === index ? { ...era, ...part } : era)))
  }

  function move(index: number, by: -1 | 1) {
    const next = [...drafts]
    const [era] = next.splice(index, 1)
    next.splice(index + by, 0, era)
    change(next)
  }

  function add() {
    created.current += 1
    change([
      ...drafts,
      {
        key: `new-${created.current}`,
        id: null,
        name: '',
        abbreviation: '',
        direction: EraDirection.Ascending,
        labelPosition: EraLabelPosition.BeforeYear,
        momentCount: 0,
        yearCount: 0,
        sceneCount: 0,
      },
    ])
  }

  function discard() {
    touched.current = false
    setDrafts(draftsFrom(stored))
    setFieldErrors({})
    setMessage(null)
    setBlocked(null)
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setMessage(null)
    setFieldErrors({})
    setBlocked(null)

    try {
      const next = await saveChronology(universeId, inputOf(drafts))
      touched.current = false
      setStored(next)
      setDrafts(draftsFrom(next))
      onSaved(next)
      setSaved(true)
    } catch (error: unknown) {
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some eras need a change before this can be saved.',
        )
      } else {
        setMessage('The chronology could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  const preview = previewYears(
    drafts.map((era) => ({
      name: era.name,
      abbreviation: era.abbreviation.trim() || null,
      direction: era.direction,
      labelPosition: era.labelPosition,
    })),
  )

  const unplacedParts = [
    stored.unplacedMomentCount > 0
      ? plural(stored.unplacedMomentCount, 'dated timeline entry', 'dated timeline entries')
      : null,
    stored.unplacedYearCount > 0
      ? plural(stored.unplacedYearCount, 'birth or death year', 'birth or death years')
      : null,
  ].filter((part): part is string => part !== null)

  const unplacedTotal = stored.unplacedMomentCount + stored.unplacedYearCount
  const storedNamesEras = stored.eras.length > 0

  return (
    <section className="settings__section" data-testid="chronology-settings">
      <h2 className="settings__heading">Chronology</h2>
      <p className="settings__note">
        {drafts.length === 0
          ? 'Years here are plain numbers. They count up, and below zero when a story needs them to. Name this world’s eras to write and order its dates by them instead.'
          : 'Eras run in the order listed, earliest first. Each one’s years count up from 1, or down to 1 as it nears the next era, and every date in this universe is ordered by them.'}
      </p>

      {drafts.length > 0 && unplacedTotal > 0 ? (
        <p className="settings__caution" data-testid="chronology-unplaced">
          {storedNamesEras
            ? `${unplacedParts.join(' and ')} ${unplacedTotal === 1 ? 'was' : 'were'} written before these eras and ${unplacedTotal === 1 ? 'has' : 'have'} none yet. Until each is given one, it sits apart on the timeline and Canon Integrity does not compare it.`
            : `Once saved, ${unplacedParts.join(' and ')} written as plain years will each need an era. Until then they sit apart on the timeline and Canon Integrity does not compare them.`}
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <ol className="eras" data-testid="eras">
          {drafts.map((era, index) => {
            const prefix = `eras[${index}]`
            const base = `era-${era.key}`
            const label = era.abbreviation.trim() || era.name.trim() || 'Era'
            const usage = usageOf(era)
            const inUse = usage !== null

            return (
              <li className="era" key={era.key} data-testid="era">
                <div className="era__fields">
                  <div className="field">
                    <label className="field__label" htmlFor={`${base}-name`}>
                      Name
                    </label>
                    <input
                      id={`${base}-name`}
                      className="field__input"
                      placeholder="After the Fall"
                      value={era.name}
                      onChange={(event) => update(index, { name: event.target.value })}
                      aria-invalid={fieldErrors[`${prefix}.name`] ? true : undefined}
                      data-testid="era-name"
                    />
                    {fieldErrors[`${prefix}.name`] ? (
                      <p className="field__error">{fieldErrors[`${prefix}.name`]}</p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor={`${base}-abbreviation`}>
                      Short label
                    </label>
                    <input
                      id={`${base}-abbreviation`}
                      className="field__input"
                      placeholder="Optional"
                      value={era.abbreviation}
                      onChange={(event) => update(index, { abbreviation: event.target.value })}
                      aria-invalid={fieldErrors[`${prefix}.abbreviation`] ? true : undefined}
                      data-testid="era-abbreviation"
                    />
                    {fieldErrors[`${prefix}.abbreviation`] ? (
                      <p className="field__error">{fieldErrors[`${prefix}.abbreviation`]}</p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor={`${base}-direction`}>
                      Years
                    </label>
                    <select
                      id={`${base}-direction`}
                      className="field__input field__input--select"
                      value={era.direction}
                      onChange={(event) =>
                        update(index, {
                          direction: Number(event.target.value) as EraDirectionValue,
                        })
                      }
                      data-testid="era-direction"
                    >
                      <option value={EraDirection.Ascending}>Count up from 1</option>
                      <option value={EraDirection.Descending}>Count down to 1</option>
                    </select>
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor={`${base}-position`}>
                      Written as
                    </label>
                    <select
                      id={`${base}-position`}
                      className="field__input field__input--select"
                      value={era.labelPosition}
                      onChange={(event) =>
                        update(index, {
                          labelPosition: Number(event.target.value) as EraLabelPositionValue,
                        })
                      }
                      data-testid="era-position"
                    >
                      <option value={EraLabelPosition.BeforeYear}>{label} 10</option>
                      <option value={EraLabelPosition.AfterYear}>10 {label}</option>
                    </select>
                  </div>
                </div>

                <div className="era__foot">
                  <p className="era__use">
                    {usage ?? (era.id ? 'Nothing dated in it yet' : 'New era')}
                  </p>
                  <div className="era__tools">
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${label} earlier`}
                      data-testid="era-earlier"
                    >
                      Earlier
                    </button>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === drafts.length - 1}
                      aria-label={`Move ${label} later`}
                      data-testid="era-later"
                    >
                      Later
                    </button>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => change(drafts.filter((_, position) => position !== index))}
                      disabled={inUse}
                      title={
                        inUse ? 'Move what is dated in this era to another one first.' : undefined
                      }
                      aria-label={`Remove ${label}`}
                      data-testid="era-remove"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      {fieldErrors.eras ? <p className="field__error">{fieldErrors.eras}</p> : null}

      <div className="form__actions">
        <button className="button button--quiet" type="button" onClick={add} data-testid="add-era">
          Add era
        </button>
      </div>

      {preview.length > 0 ? (
        <div className="eras__preview">
          <p className="field__label">In order, earliest first</p>
          <ol className="eras__line" data-testid="era-preview">
            {preview.map((year, index) => (
              <li key={`${year}-${index}`}>{year}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {blocked ? (
        <CanonBlockNotice universeId={universeId} findings={blocked} linkSubjects />
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="chronology-error">
          {message}
        </p>
      ) : null}

      {saved ? (
        <p className="settings__saved" role="status" data-testid="chronology-saved">
          Chronology saved.
        </p>
      ) : null}

      <div className="form__actions eras__actions">
        <button
          className="button"
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          data-testid="save-chronology"
        >
          {saving ? 'Saving' : 'Save chronology'}
        </button>
        {dirty ? (
          <button className="button button--quiet" type="button" onClick={discard}>
            Discard changes
          </button>
        ) : null}
      </div>
    </section>
  )
}
