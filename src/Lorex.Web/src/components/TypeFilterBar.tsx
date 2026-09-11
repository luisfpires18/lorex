import { useId, type KeyboardEvent } from 'react'
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
 * arrow keys, Home and End also move through them in reading order, which is quicker once a world
 * has many types.
 *
 * The chips wrap onto as many rows as the width needs, so every type - and in particular the one
 * that is on - is always in view, and nothing has to be scrolled to be reached.
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

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return

    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
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
