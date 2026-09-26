import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Link, type To } from 'react-router-dom'
import { ChevronDown, LayoutGrid } from 'lucide-react'
import type { EntityType } from '../lore/types'
import { ActionMenu } from './ActionMenu'
import { TypeIcon } from './TypeIcon'

/**
 * Lore's local navigation: All, then every type the universe has, in its own order - the starters
 * and every custom type alike, by id, never by name.
 *
 * A place, not a filter: each type is a link to the same list at `?type=<id>`, so Back, Forward, a
 * reload and a pasted link all land on it, and the current one carries `aria-current="page"` and
 * the accent wash. Choosing a type keeps the search and status and goes back to the first page.
 *
 * Two presentations of the one list, chosen by CSS alone. From 641px, one row of links that scrolls
 * sideways only when a world has more types than the row has room for, keeping the current one in
 * view. On a phone, a single labelled "Type" button opening every type in an `ActionMenu`, so the
 * first screen is cards rather than rows of chips.
 */
export function TypeSwitcher({
  types,
  selected,
  hrefFor,
}: {
  types: EntityType[]
  selected: EntityType | null
  /** Where choosing a type (or All, as null) goes. */
  hrefFor: (typeId: string | null) => To
}) {
  const row = useRef<HTMLDivElement>(null)

  // The current type is brought into view if it is not - on arrival, and after a choice - and the
  // row says at which end it has more, which the CSS draws as a fade at that edge.
  useEffect(() => {
    const list = row.current
    if (!list) return

    const current = list.querySelector<HTMLElement>('[aria-current="page"]')
    if (current) {
      const start = current.offsetLeft - list.offsetLeft
      const end = start + current.offsetWidth
      if (start < list.scrollLeft) list.scrollLeft = start - 8
      else if (end > list.scrollLeft + list.clientWidth)
        list.scrollLeft = end - list.clientWidth + 8
    }

    function mark() {
      if (!list) return
      list.dataset.moreBefore = String(list.scrollLeft > 1)
      list.dataset.moreAfter = String(list.scrollLeft + list.clientWidth < list.scrollWidth - 1)
    }
    mark()
    list.addEventListener('scroll', mark, { passive: true })
    window.addEventListener('resize', mark)
    return () => {
      list.removeEventListener('scroll', mark)
      window.removeEventListener('resize', mark)
    }
  }, [selected, types])

  function move(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a')]
    const at = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (at === -1) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? links.length - 1
          : Math.min(links.length - 1, Math.max(0, at + (event.key === 'ArrowLeft' ? -1 : 1)))
    links[next]?.focus()
  }

  const options = [
    { id: null, name: 'All', icon: null as string | null, accent: null as string | null },
    ...types.map((type) => ({
      id: type.id as string | null,
      name: type.name,
      icon: type.icon,
      accent: type.accentColor,
    })),
  ]

  function glyph(option: (typeof options)[number], className: string) {
    return option.id === null ? (
      <LayoutGrid className={className} aria-hidden="true" focusable="false" strokeWidth={1.75} />
    ) : (
      <TypeIcon iconKey={option.icon} className={className} />
    )
  }

  function tint(option: (typeof options)[number]) {
    return option.accent ? { ['--type-accent' as string]: option.accent } : undefined
  }

  return (
    <>
      <nav className="typeswitch" aria-label="Lore types">
        <div className="typeswitch__row" ref={row} onKeyDown={move} data-testid="lore-types">
          {options.map((option) => {
            const isCurrent = (selected?.id ?? null) === option.id
            return (
              <Link
                key={option.id ?? 'all'}
                className="typeswitch__link"
                to={hrefFor(option.id)}
                aria-current={isCurrent ? 'page' : undefined}
                style={tint(option)}
                data-testid="lore-type"
                data-type-name={option.name}
              >
                {glyph(option, 'typeswitch__icon')}
                <span className="typeswitch__name">
                  <bdi>{option.name}</bdi>
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <ActionMenu
        className="typemenu"
        panelClassName="actionmenu__panel--start typemenu__panel"
        label={`Type: ${selected?.name ?? 'All'}`}
        triggerClassName="button button--secondary typemenu__trigger"
        triggerTestId="lore-type-menu"
        panelTestId="lore-type-menu-panel"
        trigger={
          <>
            <span className="typemenu__label">Type</span>
            <span className="typemenu__current">
              <bdi>{selected?.name ?? 'All'}</bdi>
            </span>
            <ChevronDown className="typemenu__chevron" aria-hidden="true" focusable="false" />
          </>
        }
      >
        {options.map((option) => {
          const isCurrent = (selected?.id ?? null) === option.id
          return (
            <Link
              key={option.id ?? 'all'}
              className="actionmenu__item typemenu__item"
              to={hrefFor(option.id)}
              aria-current={isCurrent ? 'page' : undefined}
              style={tint(option)}
              data-type-name={option.name}
            >
              {glyph(option, 'typemenu__icon')}
              <bdi>{option.name}</bdi>
            </Link>
          )
        })}
      </ActionMenu>
    </>
  )
}
