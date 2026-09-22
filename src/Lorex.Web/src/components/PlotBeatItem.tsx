import { useId } from 'react'
import { ArrowDown, ArrowUp, Pencil, Trash } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { LoreReference } from './LoreReference'
import { containerNumber } from '../stories/format'
import type { Chapter, PlotBeat, Scene } from '../stories/types'

interface PlotBeatItemProps {
  universeId: string
  storyId: string
  beat: PlotBeat
  /** The beat's place in its arc, from 0 - the list's own order. */
  index: number
  /** How many beats its arc holds. */
  count: number
  /** Every scene of the story, in reading order: how the beat's scene ids are named. */
  scenes: Scene[]
  chapters: Chapter[]
  onMove: (beat: PlotBeat, by: -1 | 1) => void
  onEdit: (beat: PlotBeat) => void
  onDelete: (beat: PlotBeat) => void
  /** Hands the move controls to the panel, so focus can follow a beat to its new place. */
  controlRef: (key: string, element: HTMLButtonElement | null) => void
}

/**
 * One beat in its arc: its number, what develops, the scenes it plays out in and the lore it concerns, and the tools.
 * Notes stay in the form.
 *
 * Each scene is named from the story as it is now - its title, and its chapter when the story has chapters - and
 * links to that scene on the story's Scenes view; each entry links to its own page. The beat stores only ids, so a
 * scene moved to another chapter simply shows its new chapter here.
 *
 * The row takes the focus without being in the tab order, so a scene's plot chip can land a keyboard on it.
 */
export function PlotBeatItem({
  universeId,
  storyId,
  beat,
  index,
  count,
  scenes,
  chapters,
  onMove,
  onEdit,
  onDelete,
  controlRef,
}: PlotBeatItemProps) {
  const titleId = useId()
  const scenesLabelId = useId()
  const loreLabelId = useId()

  const linked = new Set(beat.sceneIds)
  const linkedScenes = scenes.filter((scene) => linked.has(scene.id))

  return (
    <li
      className="beat"
      id={`beat-${beat.id}`}
      tabIndex={-1}
      data-testid="plot-beat"
      data-title={beat.title}
    >
      <span className="beat__number" aria-hidden="true">
        {index + 1}
      </span>

      <div className="beat__body">
        <h5 className="beat__title" id={titleId}>
          <span className="visually-hidden">Beat {index + 1}: </span>
          <bdi>{beat.title}</bdi>
        </h5>

        {beat.description ? <p className="beat__description">{beat.description}</p> : null}

        {linkedScenes.length > 0 ? (
          <div className="beat__refs">
            <span className="beat__label" id={scenesLabelId}>
              Scenes
            </span>
            <ul
              className="beat__chips"
              aria-labelledby={scenesLabelId}
              data-testid="plot-beat-scenes"
            >
              {linkedScenes.map((scene) => (
                <li key={scene.id}>
                  <Link
                    className="lorechip"
                    to={`/app/universes/${universeId}/stories/${storyId}#scene-${scene.id}`}
                    data-testid="plot-beat-scene"
                    data-title={scene.title}
                  >
                    <span className="lorechip__name">
                      <bdi>{scene.title}</bdi>
                    </span>
                    {chapters.length > 0 ? (
                      <span className="lorechip__note beat__where">
                        {containerNumber(chapters, scene.chapterId)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {beat.entities.length > 0 ? (
          <div className="beat__refs">
            <span className="beat__label" id={loreLabelId}>
              Lore
            </span>
            <ul className="beat__chips" aria-labelledby={loreLabelId} data-testid="plot-beat-lore">
              {beat.entities.map((reference) => (
                <li key={reference.entityId}>
                  <LoreReference universeId={universeId} reference={reference} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="beat__tools storytools">
          <button
            ref={(element) => controlRef(`beat:${beat.id}:up`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === 0}
            onClick={() => onMove(beat, -1)}
            aria-describedby={titleId}
            data-testid="plot-beat-move-up"
          >
            <ActionIcon icon={ArrowUp} />
            Move up
          </button>
          <button
            ref={(element) => controlRef(`beat:${beat.id}:down`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(beat, 1)}
            aria-describedby={titleId}
            data-testid="plot-beat-move-down"
          >
            <ActionIcon icon={ArrowDown} />
            Move down
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onEdit(beat)}
            aria-describedby={titleId}
            data-testid="plot-beat-edit"
          >
            <ActionIcon icon={Pencil} />
            Edit beat
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onDelete(beat)}
            aria-describedby={titleId}
            data-testid="plot-beat-delete"
          >
            <ActionIcon icon={Trash} />
            Delete beat
          </button>
        </div>
      </div>
    </li>
  )
}
