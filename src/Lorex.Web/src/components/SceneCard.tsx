import { useId } from 'react'
import { ArrowDown, ArrowUp, Pencil, Trash } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { EntityPortrait } from './EntityPortrait'
import { TypeIcon } from './TypeIcon'
import type { Chronology } from '../chronology/types'
import { sceneWhen } from '../stories/format'
import type { Scene, SceneLoreReference } from '../stories/types'

/**
 * A lore reference, drawn from the lore: its type's icon, or for the point of view its portrait, and
 * its name - a real link to the entry's own page. An entry in the Trash is named but not linked,
 * because it has no page to open while it is there.
 */
function LoreReference({
  universeId,
  reference,
  portrait = false,
}: {
  universeId: string
  reference: SceneLoreReference
  portrait?: boolean
}) {
  const className = `lorechip${portrait ? ' lorechip--pov' : ''}`

  const content = (
    <>
      {portrait ? (
        <EntityPortrait
          universeId={universeId}
          entityId={reference.entityId}
          name={reference.name}
          // A trashed entry's picture is not served, so it is drawn as its initial instead.
          image={reference.isTrashed ? null : reference.image}
        />
      ) : (
        <TypeIcon iconKey={reference.entityTypeIcon} className="lorechip__icon" />
      )}
      <span className="lorechip__name">{reference.name}</span>
    </>
  )

  if (reference.isTrashed) {
    return (
      <span className={`${className} lorechip--trashed`} data-testid="lore-reference-trashed">
        {content}
        <span className="lorechip__note">(in Trash)</span>
      </span>
    )
  }

  return (
    <Link
      className={className}
      to={`/app/universes/${universeId}/lore/${reference.entityId}`}
      title={reference.entityTypeName}
      data-testid="lore-reference"
    >
      {content}
    </Link>
  )
}

interface SceneCardProps {
  universeId: string
  chronology: Chronology
  scene: Scene
  /** The scene's place in the telling, from 0 - the list's own order, which is the story's. */
  index: number
  count: number
  onMove: (scene: Scene, by: -1 | 1) => void
  onEdit: (scene: Scene) => void
  onDelete: (scene: Scene) => void
  /** Hands the move buttons to the page, so focus can follow a scene to its new place. */
  moveButtonRef: (key: string, element: HTMLButtonElement | null) => void
}

/**
 * One scene in its story's list: number, where it happens, whose eyes, what happens, what lore it
 * draws on, and the tools. Notes stay in the form - the list is for scanning.
 *
 * Reordering is two plain buttons rather than a drag gesture, so it works from a keyboard, a screen
 * reader and a phone alike. Each tool's visible label is its accessible name, and the scene's title
 * describes it, so "Move up" is announced with the scene it moves.
 */
export function SceneCard({
  universeId,
  chronology,
  scene,
  index,
  count,
  onMove,
  onEdit,
  onDelete,
  moveButtonRef,
}: SceneCardProps) {
  const titleId = useId()
  const when = sceneWhen(chronology, scene.chronology)

  return (
    <li className="scene" data-testid="scene" data-title={scene.title}>
      <span className="scene__number" aria-hidden="true">
        {index + 1}
      </span>

      <div className="scene__body">
        {when || scene.pov ? (
          <div className="scene__stamp">
            {when ? (
              <span className="scene__when" data-testid="scene-when">
                {when.text}
                {when.placed ? null : <span className="scene__unplaced"> · no era yet</span>}
              </span>
            ) : null}
            {scene.pov ? (
              <span className="scene__pov" data-testid="scene-pov">
                <span className="scene__label">Point of view</span>
                <LoreReference universeId={universeId} reference={scene.pov} portrait />
              </span>
            ) : null}
          </div>
        ) : null}

        <h4 className="scene__title" id={titleId}>
          <span className="visually-hidden">Scene {index + 1}: </span>
          {scene.title}
        </h4>

        {scene.summary ? <p className="scene__summary">{scene.summary}</p> : null}

        {scene.entities.length > 0 ? (
          <ul className="scene__lore" aria-label="Linked lore" data-testid="scene-lore">
            {scene.entities.map((reference) => (
              <li key={reference.entityId}>
                <LoreReference universeId={universeId} reference={reference} />
              </li>
            ))}
          </ul>
        ) : null}

        <div className="scene__tools">
          <button
            ref={(element) => moveButtonRef(`${scene.id}:up`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === 0}
            onClick={() => onMove(scene, -1)}
            aria-describedby={titleId}
            data-testid="scene-move-up"
          >
            <ActionIcon icon={ArrowUp} />
            Move up
          </button>
          <button
            ref={(element) => moveButtonRef(`${scene.id}:down`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(scene, 1)}
            aria-describedby={titleId}
            data-testid="scene-move-down"
          >
            <ActionIcon icon={ArrowDown} />
            Move down
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onEdit(scene)}
            aria-describedby={titleId}
            data-testid="scene-edit"
          >
            <ActionIcon icon={Pencil} />
            Edit
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onDelete(scene)}
            aria-describedby={titleId}
            data-testid="scene-delete"
          >
            <ActionIcon icon={Trash} />
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}
