import { useId, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { chapterNumber, sceneCountLabel } from '../stories/format'
import type { Chapter } from '../stories/types'

interface ChapterSectionProps {
  chapter: Chapter
  /** The chapter's place in the story, from 0 - which is also its number, plus one. */
  index: number
  count: number
  sceneCount: number
  onMove: (chapter: Chapter, by: -1 | 1) => void
  onAddScene: (chapter: Chapter) => void
  onEdit: (chapter: Chapter, index: number) => void
  onDelete: (chapter: Chapter, index: number) => void
  /** Hands the move buttons to the page, so focus can follow a chapter to its new place. */
  controlRef: (key: string, element: HTMLButtonElement | null) => void
  /** The chapter's scenes, already drawn. */
  children: ReactNode
}

/**
 * One chapter on its story's page: a modest heading - "Chapter 2 — Ashes", the number from its position
 * and the name as written - its summary, its tools, and its scenes beneath it. Notes stay in the form.
 *
 * A heading and a rule rather than a box, so a chapter groups its scenes without putting a card around
 * cards. Each tool's visible label is its accessible name and the heading describes it, so "Move up" is
 * announced with the chapter it moves.
 */
export function ChapterSection({
  chapter,
  index,
  count,
  sceneCount,
  onMove,
  onAddScene,
  onEdit,
  onDelete,
  controlRef,
  children,
}: ChapterSectionProps) {
  const headingId = useId()

  return (
    <section
      className="chapter"
      aria-labelledby={headingId}
      data-testid="chapter"
      data-title={chapter.title}
    >
      <header className="chapter__head">
        <h4 className="chapter__title" id={headingId} data-testid="chapter-heading">
          <span className="chapter__number">{chapterNumber(index)}</span>
          <span className="chapter__dash"> — </span>
          <span className="chapter__name">{chapter.title}</span>
        </h4>
        {sceneCount > 0 ? (
          <p className="chapter__meta" data-testid="chapter-scene-count">
            {sceneCountLabel(sceneCount)}
          </p>
        ) : null}

        {chapter.summary ? (
          <p className="chapter__summary" data-testid="chapter-summary">
            {chapter.summary}
          </p>
        ) : null}

        <div className="chapter__tools storytools">
          <button
            ref={(element) => controlRef(`chapter:${chapter.id}:up`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === 0}
            onClick={() => onMove(chapter, -1)}
            aria-describedby={headingId}
            data-testid="chapter-move-up"
          >
            <ActionIcon icon={ArrowUp} />
            Move up
          </button>
          <button
            ref={(element) => controlRef(`chapter:${chapter.id}:down`, element)}
            className="button button--quiet button--icon"
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(chapter, 1)}
            aria-describedby={headingId}
            data-testid="chapter-move-down"
          >
            <ActionIcon icon={ArrowDown} />
            Move down
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onAddScene(chapter)}
            aria-describedby={headingId}
            data-testid="chapter-new-scene"
          >
            <ActionIcon icon={Plus} />
            Add scene
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onEdit(chapter, index)}
            aria-describedby={headingId}
            data-testid="chapter-edit"
          >
            <ActionIcon icon={Pencil} />
            Edit chapter
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => onDelete(chapter, index)}
            aria-describedby={headingId}
            data-testid="chapter-delete"
          >
            <ActionIcon icon={Trash} />
            Delete chapter
          </button>
        </div>
      </header>

      {sceneCount > 0 ? (
        children
      ) : (
        <p className="chapter__empty" data-testid="chapter-empty">
          No scenes in this chapter yet.
        </p>
      )}
    </section>
  )
}
