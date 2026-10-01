import type { KeyboardEvent } from 'react'
import { Link, type To } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { EntityType } from '../lore/types'
import { ActionMenu } from './ActionMenu'
import { TypeIcon } from './TypeIcon'

/**
 * Lore's local navigation: every type the universe has, in the hierarchy's order - a parent, then what is nested in it, at
 * any depth (`buildTypeTree`'s `ordered`) - by id, never by name. No "All": a type is where browsing starts, and with none
 * chosen nothing is current and Lore reads no entries (ADR 0007 amendment). Names are unique across a universe, so a flat
 * row needs no indentation to tell two apart; once one is chosen, the page header says its whole path.
 *
 * A place, not a filter: each type is a link to the same list at `?type=<id>`, so Back, Forward, a reload and a pasted link
 * all land on it, and the current one carries `aria-current="page"` and the accent wash. Choosing a type keeps the search
 * and status and goes back to the first page.
 *
 * Two presentations of the one list, chosen by CSS alone. From 641px, the links wrap onto as many rows as the world's types
 * need - nothing is scrolled sideways, clipped or faded, so every type is in sight and none has to be found. On a phone, a
 * single button - "Choose type", or the chosen type's name - opening every type in an `ActionMenu`, so the first screen is
 * cards rather than rows of chips.
 */
export function TypeSwitcher({
  types,
  selected,
  hrefFor,
}: {
  /** In the hierarchy's order. */
  types: EntityType[]
  selected: EntityType | null
  hrefFor: (typeId: string) => To
}) {
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

  function tint(type: EntityType) {
    return type.accentColor ? { ['--type-accent' as string]: type.accentColor } : undefined
  }

  return (
    <>
      <nav className="typeswitch" aria-label="Lore types">
        <div className="typeswitch__row" onKeyDown={move} data-testid="lore-types">
          {types.map((type) => (
            <Link
              key={type.id}
              className="typeswitch__link"
              to={hrefFor(type.id)}
              aria-current={selected?.id === type.id ? 'page' : undefined}
              style={tint(type)}
              data-testid="lore-type"
              data-type-name={type.name}
            >
              <TypeIcon iconKey={type.icon} className="typeswitch__icon" />
              <span className="typeswitch__name">
                <bdi>{type.name}</bdi>
              </span>
            </Link>
          ))}
        </div>
      </nav>

      <ActionMenu
        className="typemenu"
        panelClassName="actionmenu__panel--start typemenu__panel"
        label={selected ? `Type: ${selected.name}` : 'Choose type'}
        triggerClassName="button button--secondary typemenu__trigger"
        triggerTestId="lore-type-menu"
        panelTestId="lore-type-menu-panel"
        trigger={
          selected ? (
            <>
              <span className="typemenu__label">Type</span>
              <span className="typemenu__current">
                <bdi>{selected.name}</bdi>
              </span>
              <ChevronDown className="typemenu__chevron" aria-hidden="true" focusable="false" />
            </>
          ) : (
            <>
              <span className="typemenu__current">Choose type</span>
              <ChevronDown className="typemenu__chevron" aria-hidden="true" focusable="false" />
            </>
          )
        }
      >
        {types.map((type) => (
          <Link
            key={type.id}
            className="actionmenu__item typemenu__item"
            to={hrefFor(type.id)}
            aria-current={selected?.id === type.id ? 'page' : undefined}
            style={tint(type)}
            data-type-name={type.name}
          >
            <TypeIcon iconKey={type.icon} className="typemenu__icon" />
            <bdi>{type.name}</bdi>
          </Link>
        ))}
      </ActionMenu>
    </>
  )
}
