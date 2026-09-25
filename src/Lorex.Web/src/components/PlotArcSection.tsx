import { useId, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { arcNumber, beatCountLabel } from '../stories/format'
import type { PlotArc } from '../stories/types'

interface PlotArcSectionProps {
  arc: PlotArc
  /** The arc's place in the plot, from 0 - which is also its number, plus one. */
  index: number
  count: number
  onMove: (arc: PlotArc, by: -1 | 1) => void
  onAddBeat: (arc: PlotArc) => void
  onEdit: (arc: PlotArc, index: number) => void
  onDelete: (arc: PlotArc, index: number) => void
  /** Hands the move buttons to the panel, so focus can follow an arc to its new place. */
  controlRef: (key: string, element: HTMLButtonElement | null) => void
  /** The arc's beats, already drawn. */
  children: ReactNode
}

/**
 * One arc in a story's plot: a heading - "Arc 2 — Fall of the King", the number from its position and the name as
 * written - its description, its tools, and its beats beneath it. Notes stay in the form.
 *
 * A heading and a rule rather than a box, so an arc groups its beats without a card around rows. Each tool's visible
 * label is its accessible name and the heading describes it, so "Move up" is announced with the arc it moves.
 */
export function PlotArcSection({
  arc,
  index,
  count,
  onMove,
  onAddBeat,
  onEdit,
  onDelete,
  controlRef,
  children,
}: PlotArcSectionProps) {
  const headingId = useId()
  const beatCount = arc.beats.length

  return (
    <section
      className="plotarc"
      id={`arc-${arc.id}`}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-testid="plot-arc"
      data-title={arc.title}
    >
      <header className="plotarc__head">
        <h4 className="plotarc__title" id={headingId} data-testid="plot-arc-heading">
          <span className="plotarc__number">{arcNumber(index)}</span>
          <span className="plotarc__dash"> — </span>
          <span className="plotarc__name">
            <bdi>{arc.title}</bdi>
          </span>
        </h4>
        {beatCount > 0 ? (
          <p className="plotarc__meta" data-testid="plot-arc-beat-count">
            {beatCountLabel(beatCount)}
          </p>
        ) : null}

        {arc.description ? (
          <p className="plotarc__description prose" data-testid="plot-arc-description">
            {arc.description}
          </p>
        ) : null}

        <div className="plotarc__tools storytools">
          <button
            ref={(element) => controlRef(`arc:${arc.id}:up`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === 0}
            onClick={() => onMove(arc, -1)}
            aria-describedby={headingId}
            data-testid="plot-arc-move-up"
          >
            <ActionIcon icon={ArrowUp} />
            Move up
          </button>
          <button
            ref={(element) => controlRef(`arc:${arc.id}:down`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(arc, 1)}
            aria-describedby={headingId}
            data-testid="plot-arc-move-down"
          >
            <ActionIcon icon={ArrowDown} />
            Move down
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onAddBeat(arc)}
            aria-describedby={headingId}
            data-testid="plot-arc-new-beat"
          >
            <ActionIcon icon={Plus} />
            Add beat
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onEdit(arc, index)}
            aria-describedby={headingId}
            data-testid="plot-arc-edit"
          >
            <ActionIcon icon={Pencil} />
            Edit arc
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onDelete(arc, index)}
            aria-describedby={headingId}
            data-testid="plot-arc-delete"
          >
            <ActionIcon icon={Trash} />
            Delete arc
          </button>
        </div>
      </header>

      {beatCount > 0 ? (
        children
      ) : (
        <p className="plotarc__empty" data-testid="plot-arc-empty">
          No beats yet.
        </p>
      )}
    </section>
  )
}
