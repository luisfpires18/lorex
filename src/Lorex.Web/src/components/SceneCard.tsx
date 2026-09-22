import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowRightLeft, ArrowUp, PenLine, Pencil, Trash } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { SceneBeats, SceneLore, SceneStamp } from './SceneContext'
import type { Chronology } from '../chronology/types'
import type { SceneBeatReference } from '../stories/structure'
import type { Scene } from '../stories/types'

/** A container a scene can be moved into: a chapter, or Unchaptered when `chapterId` is null. */
export interface MoveTarget {
  chapterId: string | null
  label: string
}

/**
 * "Move to…": where else this scene could be told, one press each.
 *
 * A disclosure of plain buttons, like the account menu, rather than a select that acts on change - a
 * closed select changes value on every arrow key in some browsers, which would move the scene before
 * the author had finished choosing. Escape closes and hands focus back; a press outside closes; opening
 * moves focus to the first choice.
 */
function MoveToMenu({
  scene,
  describedBy,
  targets,
  onChoose,
  controlRef,
}: {
  scene: Scene
  describedBy: string
  targets: MoveTarget[]
  onChoose: (chapterId: string | null) => void
  controlRef: (key: string, element: HTMLButtonElement | null) => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const firstChoice = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) firstChoice.current?.focus()
  }, [open])

  return (
    <div className="movemenu" ref={root}>
      <button
        ref={(element) => {
          trigger.current = element
          controlRef(`${scene.id}:to`, element)
        }}
        className="button button--quiet button--icon"
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-testid="scene-move-to"
      >
        <ActionIcon icon={ArrowRightLeft} />
        Move to…
      </button>

      {open ? (
        <div className="movemenu__panel" id={panelId} data-testid="scene-move-to-panel">
          <p className="movemenu__label" id={`${panelId}-label`}>
            Move “{scene.title}” to
          </p>
          <ul className="movemenu__list" aria-labelledby={`${panelId}-label`}>
            {targets.map((target, index) => (
              <li key={target.chapterId ?? 'unchaptered'}>
                <button
                  ref={index === 0 ? firstChoice : undefined}
                  className="movemenu__item"
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onChoose(target.chapterId)
                  }}
                  data-testid="scene-move-to-option"
                  data-target={target.label}
                >
                  {target.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

interface SceneCardProps {
  universeId: string
  chronology: Chronology
  scene: Scene
  /** The scene's place in its container's telling, from 0 - the list's own order. */
  index: number
  /** How many scenes its container holds. */
  count: number
  /** 5 under a chapter or Unchaptered heading, 4 in a story with no chapters. */
  titleLevel: 4 | 5
  /** Every other container the scene could move to. Empty in a story with no chapters. */
  moveTargets: MoveTarget[]
  /** The plot beats that point at this scene, arc by arc. Shown only: a scene holds no beat. */
  beats: SceneBeatReference[]
  onMove: (scene: Scene, by: -1 | 1) => void
  onMoveTo: (scene: Scene, chapterId: string | null) => void
  onEdit: (scene: Scene) => void
  onDelete: (scene: Scene) => void
  /** Hands the move controls to the page, so focus can follow a scene to its new place. */
  controlRef: (key: string, element: HTMLButtonElement | null) => void
}

/**
 * One scene in its container's list: number, where it happens, whose eyes, what happens, what lore it
 * draws on, which plot beats point at it, and the tools. Notes stay in the form - the list is for scanning.
 *
 * The lore and plot rows are read-only. The beats own those links, so each one is a way to the beat on the
 * story's Plot view rather than something edited here.
 *
 * Write opens this scene on the Manuscript view - the one editor, at the scene's own address - so a writer
 * never has to find the scene again in the outline. Reordering is plain buttons rather than a drag gesture, so
 * it works from a keyboard, a screen reader and a phone alike. Move up and Move down stay inside the scene's
 * chapter; Move to… takes it to another chapter or to Unchaptered, last there. Each tool's visible label is its
 * accessible name, and the scene's title describes it, so "Move up" is announced with the scene it moves.
 *
 * The row takes the focus - but is never in the tab order - so a link that lands on the scene can put a keyboard
 * and a screen reader there too.
 */
export function SceneCard({
  universeId,
  chronology,
  scene,
  index,
  count,
  titleLevel,
  moveTargets,
  beats,
  onMove,
  onMoveTo,
  onEdit,
  onDelete,
  controlRef,
}: SceneCardProps) {
  const titleId = useId()
  const Title = titleLevel === 5 ? 'h5' : 'h4'

  return (
    <li
      className="scene"
      id={`scene-${scene.id}`}
      tabIndex={-1}
      data-testid="scene"
      data-title={scene.title}
    >
      <span className="scene__number" aria-hidden="true">
        {index + 1}
      </span>

      <div className="scene__body">
        <SceneStamp universeId={universeId} chronology={chronology} scene={scene} testId="scene" />

        <Title className="scene__title" id={titleId}>
          <span className="visually-hidden">Scene {index + 1}: </span>
          <bdi>{scene.title}</bdi>
        </Title>

        {scene.summary ? <p className="scene__summary">{scene.summary}</p> : null}

        <SceneLore universeId={universeId} scene={scene} testId="scene" />
        <SceneBeats universeId={universeId} storyId={scene.storyId} beats={beats} testId="scene" />

        <div className="scene__tools storytools">
          <Link
            className="button button--quiet button--icon"
            to={`/app/universes/${universeId}/stories/${scene.storyId}/manuscript/${scene.id}`}
            aria-describedby={titleId}
            data-testid="scene-write"
          >
            <ActionIcon icon={PenLine} />
            Write
          </Link>
          <button
            ref={(element) => controlRef(`${scene.id}:up`, element)}
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
            ref={(element) => controlRef(`${scene.id}:down`, element)}
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
          {moveTargets.length > 0 ? (
            <MoveToMenu
              scene={scene}
              describedBy={titleId}
              targets={moveTargets}
              onChoose={(chapterId) => onMoveTo(scene, chapterId)}
              controlRef={controlRef}
            />
          ) : null}
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onEdit(scene)}
            aria-describedby={titleId}
            data-testid="scene-edit"
          >
            <ActionIcon icon={Pencil} />
            Edit scene
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onDelete(scene)}
            aria-describedby={titleId}
            data-testid="scene-delete"
          >
            <ActionIcon icon={Trash} />
            Delete scene
          </button>
        </div>
      </div>
    </li>
  )
}
