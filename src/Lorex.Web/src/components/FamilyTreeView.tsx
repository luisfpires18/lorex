import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EntityPortrait } from './EntityPortrait'
import { readFamilyTree, type FamilyMember } from '../familyTree/reading'
import { POSITION_LABELS, type FamilyPosition, type FamilyTree } from '../familyTree/types'
import { CANON_LABELS, CanonStatus } from '../lore/types'
import { StatusBadge } from './StatusBadge'
import { FamilySemantic } from '../relationships/types'

interface Props {
  universeId: string
  tree: FamilyTree
  onFocus: (entityId: string) => void
}

/** One drawn line between two cards. */
interface Edge {
  id: string
  d: string
  semantic: number
  canonStatus: number
}

/** The rows, top to bottom. The focal entry stands in the middle row with its siblings beside it. */
const ROWS: { position: FamilyPosition; label: string }[] = [
  { position: 'grandparents', label: POSITION_LABELS.grandparents.many },
  { position: 'parents', label: POSITION_LABELS.parents.many },
  { position: 'siblings', label: 'This entry and siblings' },
  { position: 'children', label: POSITION_LABELS.children.many },
  { position: 'grandchildren', label: POSITION_LABELS.grandchildren.many },
]

/**
 * A family, drawn as generations rather than as a graph: grandparents and parents above, the focal entry and
 * its siblings in the middle, children and grandchildren below.
 *
 * The lines are decoration - they are measured from the cards and drawn in an `aria-hidden` SVG - so the
 * structure a screen reader or a keyboard follows is the headings, lists and text of the cards themselves,
 * where every position and every biological or adoptive link is written out in words.
 */
export function FamilyTreeView({ universeId, tree, onFocus }: Props) {
  const family = useMemo(() => readFamilyTree(tree), [tree])
  const canvas = useRef<HTMLDivElement>(null)
  const focalCard = useRef<HTMLLIElement>(null)
  const cards = useRef(new Map<string, HTMLLIElement | null>())
  const [edges, setEdges] = useState<Edge[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })

  const measure = useCallback(() => {
    const root = canvas.current
    if (!root) return

    const bounds = root.getBoundingClientRect()
    const drawn: Edge[] = []

    for (const link of tree.links) {
      const from = cards.current.get(link.parentEntityId)
      const to = cards.current.get(link.childEntityId)
      if (!from || !to) continue

      const parent = from.getBoundingClientRect()
      const child = to.getBoundingClientRect()

      // Normally a parent sits above its child. When it does not - two positions in one row, or a circle of
      // links - the line leaves and arrives on the other edge instead of cutting through the cards.
      const downwards = child.top >= parent.bottom
      const x1 = parent.left + parent.width / 2 - bounds.left
      const x2 = child.left + child.width / 2 - bounds.left
      const y1 = (downwards ? parent.bottom : parent.top) - bounds.top
      const y2 = (downwards ? child.top : child.bottom) - bounds.top
      const bend = Math.max(18, Math.abs(y2 - y1) / 2) * (downwards ? 1 : -1)

      drawn.push({
        id: link.relationshipId,
        d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
        semantic: link.semantic,
        canonStatus: link.canonStatus,
      })
    }

    setEdges(drawn)
    setSize({ width: root.scrollWidth, height: root.scrollHeight })
  }, [tree])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const root = canvas.current
    if (!root || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => measure())
    observer.observe(root)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  // A wide family scrolls sideways inside its own box; the entry being looked at starts in view.
  useEffect(() => {
    focalCard.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [tree.focalEntityId])

  const focal = family.focal

  return (
    <div className="familytree" data-testid="family-tree">
      <div className="familytree__scroll">
        <div className="familytree__canvas" ref={canvas}>
          <svg
            className="familytree__lines"
            aria-hidden="true"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          >
            {edges.map((edge) => (
              <path
                key={edge.id}
                className="familytree__line"
                d={edge.d}
                data-semantic={edge.semantic}
                data-canon={edge.canonStatus}
              />
            ))}
          </svg>

          {ROWS.map((row) => {
            const members = family.rows[row.position]
            const isFocalRow = row.position === 'siblings'
            if (members.length === 0 && !isFocalRow) return null

            // Siblings stand on both sides of the entry being looked at, so it stays in the middle.
            const half = Math.ceil(members.length / 2)
            const before = isFocalRow ? members.slice(0, half) : members
            const after = isFocalRow ? members.slice(half) : []

            return (
              <section
                className="familytree__row"
                key={row.position}
                aria-label={row.label}
                data-row={row.position}
              >
                <h3 className="familytree__rowlabel">{row.label}</h3>
                <ul className="familytree__members">
                  {before.map((member) => (
                    <Card
                      key={member.node.entityId}
                      member={member}
                      universeId={universeId}
                      onFocus={onFocus}
                      register={register}
                    />
                  ))}

                  {isFocalRow && focal ? (
                    <li
                      className="familynode familynode--focal"
                      ref={(node) => {
                        focalCard.current = node
                        register(focal.entityId, node)
                      }}
                      data-testid={`family-node-${focal.name}`}
                      data-focal="true"
                    >
                      <div className="familynode__head">
                        <EntityPortrait
                          universeId={universeId}
                          entityId={focal.entityId}
                          name={focal.name}
                          image={focal.image}
                        />
                        <p className="familynode__name">
                          <bdi>{focal.name}</bdi>
                        </p>
                      </div>
                      <p className="familynode__kind">
                        <span className="familynode__focusmark">Family shown for this entry</span>
                        <span>{focal.entityTypeName}</span>
                        {focal.canonStatus === CanonStatus.Canon ? null : (
                          <span className="chip" data-canon={focal.canonStatus}>
                            {CANON_LABELS[focal.canonStatus]}
                          </span>
                        )}
                      </p>
                      <Link
                        className="familynode__open"
                        to={`/app/universes/${universeId}/lore/${focal.entityId}`}
                      >
                        Open entry
                      </Link>
                    </li>
                  ) : null}

                  {after.map((member) => (
                    <Card
                      key={member.node.entityId}
                      member={member}
                      universeId={universeId}
                      onFocus={onFocus}
                      register={register}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>

      <p className="familytree__legend" data-testid="family-legend">
        <span
          className="familytree__key"
          data-semantic={FamilySemantic.BiologicalParent}
          aria-hidden="true"
        />
        <span>Biological</span>
        <span
          className="familytree__key"
          data-semantic={FamilySemantic.AdoptiveParent}
          aria-hidden="true"
        />
        <span>Adoptive</span>
        <span className="familytree__legendnote">
          A faded line is a connection that is not Canon yet. Every connection is written out on the
          cards as well as drawn.
        </span>
      </p>
    </div>
  )

  function register(entityId: string, node: HTMLLIElement | null) {
    if (node) cards.current.set(entityId, node)
    else cards.current.delete(entityId)
  }
}

interface CardProps {
  member: FamilyMember
  universeId: string
  onFocus: (entityId: string) => void
  register: (entityId: string, node: HTMLLIElement | null) => void
}

/** One relative: who they are, every position they hold here, and the two things that can be done with them. */
function Card({ member, universeId, onFocus, register }: CardProps) {
  const { node, relations } = member

  return (
    <li
      className="familynode"
      ref={(element) => register(node.entityId, element)}
      data-testid={`family-node-${node.name}`}
    >
      <button
        className="familynode__head familynode__button"
        type="button"
        onClick={() => onFocus(node.entityId)}
        data-testid={`family-focus-${node.name}`}
      >
        <EntityPortrait
          universeId={universeId}
          entityId={node.entityId}
          name={node.name}
          image={node.image}
        />
        <span className="familynode__name">
          <bdi>{node.name}</bdi>
        </span>
        <span className="familynode__action">Show this family</span>
      </button>

      <p className="familynode__kind">
        <span>{node.entityTypeName}</span>
        {node.canonStatus === CanonStatus.Canon ? null : (
          <StatusBadge step={node.canonStatus} label={CANON_LABELS[node.canonStatus]} />
        )}
      </p>

      <ul className="familynode__roles">
        {relations.flatMap((relation) =>
          relation.paths.map((path) => (
            <li key={`${relation.position}-${path.linkIds.join('-')}`}>
              <span className="familynode__position">{POSITION_LABELS[relation.position].one}</span>
              <span dir="auto">{path.text}</span>
              {path.canonStatus === CanonStatus.Canon ? null : (
                <span className="familynode__draft">
                  {CANON_LABELS[path.canonStatus]} connection
                </span>
              )}
            </li>
          )),
        )}
      </ul>

      <Link className="familynode__open" to={`/app/universes/${universeId}/lore/${node.entityId}`}>
        Open entry
      </Link>
    </li>
  )
}
