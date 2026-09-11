import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { LayoutGrid } from 'lucide-react'
import type { EntityType } from '../lore/types'
import { TypeIcon } from './TypeIcon'

/**
 * The Lore browser's type filter: "All", then every type the universe actually has, each as a
 * pressable chip with its icon.
 *
 * It filters exactly as the select it replaced did - one type or every type, combined with the
 * search and the status - so only the control changed, not what it asks the API for.
 *
 * Buttons with `aria-pressed`, because each one is a switch the author turns on; pressing the one
 * already on turns it off again, back to every type. All of them are in the tab order, and the
 * arrow keys, Home and End also move along the row, which is quicker once a world has many types.
 *
 * The row never wraps. It scrolls sideways when it runs out of room, on a phone and on a desktop
 * with a long list alike, and it keeps the chosen chip in view so a filter that is on is never
 * one the author cannot see.
 */
export function TypeFilterBar({
  types,
  selected,
  onSelect,
}: {
  types: EntityType[]
  selected: string | null
  onSelect: (typeId: string | null) => void
}) {
  const labelId = useId()
  const row = useRef<HTMLDivElement>(null)

  // Sideways only. `scrollIntoView` would also scroll the page to reach the row, which is not
  // what choosing a type should ever do.
  useEffect(() => {
    const container = row.current
    const pressed = container?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!container || !pressed) return

    const start = pressed.offsetLeft
    const end = start + pressed.offsetWidth
    const margin = 24

    if (start < container.scrollLeft) {
      container.scrollTo({ left: Math.max(0, start - margin) })
    } else if (end > container.scrollLeft + container.clientWidth) {
      container.scrollTo({ left: end - container.clientWidth + margin })
    }
  }, [selected, types])

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key) || !row.current) return

    const options = [...row.current.querySelectorAll<HTMLButtonElement>('button')]
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    if (current === -1) return

    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : Math.min(
              options.length - 1,
              Math.max(0, current + (event.key === 'ArrowLeft' ? -1 : 1)),
            )
    options[next]?.focus()
  }

  return (
    <div className="typebar">
      <span className="field__label typebar__label" id={labelId}>
        Type
      </span>

      <div
        className="typebar__row"
        ref={row}
        role="group"
        aria-labelledby={labelId}
        onKeyDown={move}
        data-testid="type-filter"
      >
        <button
          className="typebar__option"
          type="button"
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
          data-testid="type-filter-all"
        >
          <span className="typebar__icon">
            <LayoutGrid aria-hidden="true" focusable="false" strokeWidth={1.75} />
          </span>
          <span className="typebar__name">All</span>
        </button>

        {types.map((type) => (
          <button
            key={type.id}
            className="typebar__option"
            type="button"
            aria-pressed={selected === type.id}
            onClick={() => onSelect(selected === type.id ? null : type.id)}
            style={type.accentColor ? { ['--type-accent' as string]: type.accentColor } : undefined}
            data-testid="type-filter-option"
            data-type-name={type.name}
          >
            <span className="typebar__icon">
              <TypeIcon iconKey={type.icon} />
            </span>
            <span className="typebar__name">{type.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
