import type { KeyboardEvent } from 'react'
import { Link, type To } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { TypeNode, TypeTree } from '../lore/typeTree'
import { ActionMenu } from './ActionMenu'
import { TypeIcon } from './TypeIcon'

/** One level of the navigation: the type whose children it lists (null for the top), and those children. */
interface Level {
  parent: TypeNode | null
  nodes: TypeNode[]
}

/**
 * The levels on screen for a choice: the top-level categories always, then - for each type on the chosen path that holds
 * others - a row of what is inside it. Choosing Runes shows the categories and Runes' subtypes; choosing Original Runes
 * (inside Runes) shows the same two rows with Original Runes current; a subtype that itself holds types adds a third row.
 * Nothing nested is ever listed beside the top-level categories.
 */
function levelsFor(tree: TypeTree, selected: TypeNode | null): Level[] {
  const levels: Level[] = [{ parent: null, nodes: tree.roots }]
  for (const type of selected?.path ?? []) {
    const node = tree.byId.get(type.id)
    if (node && node.children.length > 0) levels.push({ parent: node, nodes: node.children })
  }
  return levels
}

/**
 * Lore's local navigation, in the hierarchy's own shape (Product refinement 028). The top row is the universe's top-level
 * categories; a category that holds others opens a quieter row beneath it - "All Runes" first, which is Runes itself and so
 * its whole branch, then each subtype. There is still no "All" at the top: with nothing chosen nothing is current and Lore
 * reads no entries (ADR 0007 amendment).
 *
 * A place, not a filter: every item is a link to the same list at `?type=<id>`, so Back, Forward, a reload and a pasted
 * link land on it. The exact choice carries `aria-current="page"`; the category it sits in, on the row above, carries
 * `aria-current="true"` - both drawn by weight and a rule as well as by colour. Arrow keys, Home and End move along a row.
 *
 * Two presentations of the same levels, chosen by CSS alone: from 641px the rows themselves, each wrapping onto as many
 * lines as it needs; on a phone one compact menu per level - "Category", then "In Runes" - so nothing wraps and nothing
 * scrolls sideways.
 */
export function TypeSwitcher({
  tree,
  selected,
  hrefFor,
}: {
  tree: TypeTree
  selected: TypeNode | null
  hrefFor: (typeId: string) => To
}) {
  const levels = levelsFor(tree, selected)
  const onPath = new Set(selected?.path.map((type) => type.id) ?? [])

  function move(event: KeyboardEvent<HTMLUListElement>) {
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

  function tint(node: TypeNode) {
    return node.type.accentColor
      ? { ['--type-accent' as string]: node.type.accentColor }
      : undefined
  }

  /** `page` for the exact choice, `true` for a category the choice sits inside. */
  function current(node: TypeNode) {
    if (selected?.type.id === node.type.id) return 'page' as const
    return onPath.has(node.type.id) ? ('true' as const) : undefined
  }

  /** The level's own items: "All <parent>" first on a subtype row, then each type in it. */
  function items(level: Level) {
    return [
      ...(level.parent
        ? [{ node: level.parent, label: `All ${level.parent.type.name}`, all: true }]
        : []),
      ...level.nodes.map((node) => ({ node, label: node.type.name, all: false })),
    ]
  }

  /** What a level's menu names as chosen on a phone, or null if nothing on it is. */
  function chosenOn(level: Level) {
    if (level.parent && selected?.type.id === level.parent.type.id)
      return `All ${level.parent.type.name}`
    return level.nodes.find((node) => onPath.has(node.type.id))?.type.name ?? null
  }

  return (
    <>
      <nav className="typeswitch" aria-label="Lore types" data-testid="lore-types">
        {levels.map((level, depth) => (
          <ul
            key={level.parent?.type.id ?? 'top'}
            className={depth === 0 ? 'typeswitch__row' : 'typeswitch__row typeswitch__row--sub'}
            aria-label={level.parent ? `Inside ${level.parent.type.name}` : 'Categories'}
            onKeyDown={move}
            data-testid={depth === 0 ? 'lore-categories' : 'lore-subtypes'}
            data-parent-name={level.parent?.type.name}
          >
            {items(level).map(({ node, label, all }) => {
              // On a subtype row, "All <parent>" is current when the parent itself is the choice; the parent is never
              // marked as "a category the choice sits inside" there - the row above says that.
              const state = all
                ? selected?.type.id === node.type.id
                  ? ('page' as const)
                  : undefined
                : current(node)
              return (
                <li key={all ? `all-${node.type.id}` : node.type.id}>
                  <Link
                    className={all ? 'typeswitch__link typeswitch__link--all' : 'typeswitch__link'}
                    to={hrefFor(node.type.id)}
                    aria-current={state}
                    style={tint(node)}
                    data-testid={all ? 'lore-type-all' : 'lore-type'}
                    data-type-name={node.type.name}
                  >
                    {all ? null : (
                      <TypeIcon iconKey={node.type.icon} className="typeswitch__icon" />
                    )}
                    <span className="typeswitch__name">
                      <bdi>{label}</bdi>
                    </span>
                    {!all && depth === 0 && node.children.length > 0 ? (
                      <span className="typeswitch__count" aria-hidden="true">
                        {node.children.length}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        ))}
      </nav>

      {levels.map((level, depth) => {
        const chosen = chosenOn(level)
        const what = level.parent ? `In ${level.parent.type.name}` : 'Category'
        return (
          <ActionMenu
            key={level.parent?.type.id ?? 'top'}
            className={depth === 0 ? 'typemenu' : 'typemenu typemenu--sub'}
            panelClassName="actionmenu__panel--start typemenu__panel"
            label={
              chosen
                ? `${what}: ${chosen}`
                : depth === 0
                  ? 'Choose category'
                  : `Choose in ${level.parent!.type.name}`
            }
            triggerClassName="button button--secondary typemenu__trigger"
            triggerTestId={depth === 0 ? 'lore-type-menu' : 'lore-subtype-menu'}
            panelTestId={depth === 0 ? 'lore-type-menu-panel' : 'lore-subtype-menu-panel'}
            trigger={
              <>
                {chosen ? <span className="typemenu__label">{what}</span> : null}
                <span className="typemenu__current">
                  <bdi>
                    {chosen ?? (depth === 0 ? 'Choose category' : `All ${level.parent!.type.name}`)}
                  </bdi>
                </span>
                <ChevronDown className="typemenu__chevron" aria-hidden="true" focusable="false" />
              </>
            }
          >
            {items(level).map(({ node, label, all }) => (
              <Link
                key={all ? `all-${node.type.id}` : node.type.id}
                className="actionmenu__item typemenu__item"
                to={hrefFor(node.type.id)}
                aria-current={
                  all ? (selected?.type.id === node.type.id ? 'page' : undefined) : current(node)
                }
                style={tint(node)}
                data-type-name={node.type.name}
              >
                {all ? null : <TypeIcon iconKey={node.type.icon} className="typemenu__icon" />}
                <bdi>{label}</bdi>
              </Link>
            ))}
          </ActionMenu>
        )
      })}
    </>
  )
}
