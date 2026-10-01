import { useEffect, useId, useRef, useState } from 'react'
import { useOpenBranches } from '../lore/useOpenBranches'
import { Link, type To } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TypeNode, TypeTree } from '../lore/typeTree'
import { TypeIcon } from './TypeIcon'

/**
 * A universe's types as nested lists: each type a link to Lore at `?type=<id>`, and a type holding others a button before it
 * that opens or closes them. Real lists and real buttons, no tree role: a link goes somewhere, a button shows more, and both
 * keep the keys a browser already gives them. The chosen type is `aria-current="page"`; its ancestors are marked for the eye
 * as well, and the page header says the whole path in words.
 */
export function TypeTreeList({
  nodes,
  selectedId,
  ancestorIds,
  hrefFor,
  open,
  onToggle,
  onChoose,
}: {
  nodes: TypeNode[]
  selectedId: string | null
  ancestorIds: ReadonlySet<string>
  hrefFor: (typeId: string) => To
  open: ReadonlySet<string>
  onToggle: (typeId: string) => void
  onChoose?: () => void
}) {
  return (
    <ul className="typetree__list">
      {nodes.map((node) => {
        const { type } = node
        const isOpen = open.has(type.id)
        const hasChildren = node.children.length > 0
        return (
          <li
            key={type.id}
            className="typetree__item"
            data-depth={node.depth}
            style={type.accentColor ? { ['--type-accent' as string]: type.accentColor } : undefined}
          >
            <div className="typetree__row">
              {hasChildren ? (
                <button
                  className="typetree__toggle"
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`Types inside ${type.name}`}
                  onClick={() => onToggle(type.id)}
                  data-testid="lore-type-toggle"
                  data-type-name={type.name}
                >
                  {isOpen ? (
                    <ChevronDown aria-hidden="true" focusable="false" />
                  ) : (
                    <ChevronRight aria-hidden="true" focusable="false" />
                  )}
                </button>
              ) : (
                <span className="typetree__spacer" aria-hidden="true" />
              )}
              <Link
                className="typetree__link"
                to={hrefFor(type.id)}
                aria-current={type.id === selectedId ? 'page' : undefined}
                data-ancestor={ancestorIds.has(type.id) ? 'true' : undefined}
                onClick={onChoose}
                data-testid="lore-type"
                data-type-name={type.name}
              >
                <TypeIcon iconKey={type.icon} className="typetree__icon" />
                <span className="typetree__name">
                  <bdi>{type.name}</bdi>
                </span>
              </Link>
            </div>
            {hasChildren && isOpen ? (
              <TypeTreeList
                nodes={node.children}
                selectedId={selectedId}
                ancestorIds={ancestorIds}
                hrefFor={hrefFor}
                open={open}
                onToggle={onToggle}
                onChoose={onChoose}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Lore's type chooser on every width: one button that names the chosen type - or asks for one - and opens the universe's
 * types beneath it as the same nested lists. A disclosure, not a menu: what opens is lists of links and buttons, and Tab
 * walks through them like any other part of the page. Escape or a press outside closes it and hands the focus back; choosing
 * a type closes it.
 */
export function TypeChooser({
  tree,
  selected,
  hrefFor,
}: {
  tree: TypeTree
  selected: TypeNode | null
  hrefFor: (typeId: string) => To
}) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const { open, toggle } = useOpenBranches(tree, selected?.type.id ?? null)
  const ancestors = new Set(selected?.path.slice(0, -1).map((type) => type.id) ?? [])

  // Opening puts the focus on the chosen type, or the first one, so the keyboard starts where the author is.
  useEffect(() => {
    if (!isOpen) return
    const panel = document.getElementById(panelId)
    ;(
      panel?.querySelector<HTMLElement>('[aria-current="page"]') ??
      panel?.querySelector<HTMLElement>('a')
    )?.focus()
  }, [isOpen, panelId])

  useEffect(() => {
    if (!isOpen) return
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [isOpen])

  return (
    <div
      className="typechooser"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation()
          setIsOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        className="button button--secondary typechooser__trigger"
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={selected ? `Type: ${selected.type.name}` : 'Choose type'}
        onClick={() => setIsOpen((current) => !current)}
        data-testid="lore-type-menu"
      >
        {selected ? <TypeIcon iconKey={selected.type.icon} className="typechooser__icon" /> : null}
        <span className="typechooser__label">{selected ? 'Type' : 'Choose type'}</span>
        {selected ? (
          <span className="typechooser__current">
            <bdi>{selected.type.name}</bdi>
          </span>
        ) : null}
        <ChevronDown className="typechooser__chevron" aria-hidden="true" focusable="false" />
      </button>
      {isOpen ? (
        <nav
          className="typechooser__panel typetree"
          id={panelId}
          aria-label="Lore types"
          data-testid="lore-type-menu-panel"
        >
          {tree.roots.length > 0 ? (
            <TypeTreeList
              nodes={tree.roots}
              selectedId={selected?.type.id ?? null}
              ancestorIds={ancestors}
              hrefFor={hrefFor}
              open={open}
              onToggle={toggle}
              onChoose={() => {
                setIsOpen(false)
                trigger.current?.focus()
              }}
            />
          ) : (
            <p className="typechooser__none">This universe has no types yet.</p>
          )}
        </nav>
      ) : null}
    </div>
  )
}
