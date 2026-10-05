import { useEffect, useId, useMemo, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EntityPicker, type EntityChoice } from '../components/EntityPicker'
import { FamilyDiscovery, type FamiliesReturn } from '../components/FamilyDiscovery'
import { FamilyKindDialog } from '../components/FamilyKindDialog'
import { FamilyLinkForm } from '../components/FamilyLinkForm'
import { FamilyTreeView } from '../components/FamilyTreeView'
import { StatusBadge } from '../components/StatusBadge'
import { getFamilyTree } from '../familyTree/api'
import { confirmLeaving } from '../lib/leaveGuard'
import { linkSentence } from '../familyTree/reading'
import type { FamilyTree } from '../familyTree/types'
import { listEntityTypes } from '../lore/api'
import { CANON_LABELS, CanonStatus } from '../lore/types'
import { listRelationshipTypes } from '../relationships/api'
import { FamilySemantic, type RelationshipType } from '../relationships/types'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'
import { EmptyState } from '../components/EmptyState'

/**
 * Every answered state carries the entry it is about, so a tree, a refusal or a failure that belongs to the
 * entry before this one is never shown for this one - it reads as still on its way instead.
 */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; entityId: string; tree: FamilyTree }
  | { kind: 'missing'; entityId: string }
  | { kind: 'error'; entityId: string; message: string }

/**
 * The Family Tree: one entry's family, worked out from the parent connections recorded on entries (ADR 0035).
 *
 * The entry in focus is in the address, so a reload, the browser's Back and a link from elsewhere all land on
 * the same family. Nothing here is stored: every relative on screen is derived from explicit links whose kind
 * an author gave a parent meaning, and this page reads them rather than being a second place to keep them.
 *
 * Since ADR 0040 the picker offers only entries of a type the author enabled for the Family Tree, and the focal
 * entry's other family - "uncle of", "married to" - is listed apart, as the authored links they are. An entry of
 * a type not enabled still opens here by its address, with a note that says so: nothing recorded is hidden.
 *
 * Without an entry in the address the page opens on the families already recorded (`FamilyDiscovery`, 035): a few
 * names and a size each, opening the tree on one of them. "Browse families" on a tree goes back to that list.
 */
export default function FamilyTreePage() {
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const headingId = useId()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [kinds, setKinds] = useState<RelationshipType[] | null>(null)
  const [hasEligibleType, setHasEligibleType] = useState<boolean | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [isCreatingKind, setIsCreatingKind] = useState(false)
  const [reads, setReads] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listEntityTypes(universe.id, controller.signal)
      .then((types) => setHasEligibleType(types.some((type) => type.familyTreeEligible)))
      .catch(() => {
        // Unknown is not "none": say nothing rather than send the author to Types for no reason.
        if (!controller.signal.aborted) setHasEligibleType(true)
      })

    return () => {
      controller.abort()
    }
  }, [universe.id])

  useEffect(() => {
    const controller = new AbortController()

    listRelationshipTypes(universe.id, controller.signal)
      .then(setKinds)
      .catch(() => {
        if (!controller.signal.aborted) setKinds([])
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, reads])

  useEffect(() => {
    if (!entityId) return

    const controller = new AbortController()

    getFamilyTree(universe.id, entityId, controller.signal)
      .then((tree) => setState({ kind: 'ready', entityId, tree }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // The API answers 404 for an entry that is not here, belongs to another universe, or is in the Trash.
        setState(
          (error as { status?: number }).status === 404
            ? { kind: 'missing', entityId }
            : { kind: 'error', entityId, message: 'This family tree could not be read.' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, reads])

  // Worked out while rendering rather than stored: no entry in the address is the empty state, and an answer
  // about another entry is a tree still on its way.
  const view: LoadState | { kind: 'idle' } = !entityId
    ? { kind: 'idle' }
    : state.kind !== 'loading' && state.entityId === entityId
      ? state
      : { kind: 'loading' }

  const familyKinds = useMemo(
    () => (kinds ?? []).filter((kind) => kind.familySemantic !== FamilySemantic.None),
    [kinds],
  )

  const tree = view.kind === 'ready' ? view.tree : null
  const focal = tree?.nodes.find((node) => node.entityId === tree.focalEntityId) ?? null
  const nodes = useMemo(
    () => new Map((tree?.nodes ?? []).map((node) => [node.entityId, node])),
    [tree],
  )
  const isAdding = !!entityId && addingFor === entityId
  // Only ever a query string this app put there; anything else is ignored rather than followed.
  const carried = (location.state as Partial<FamiliesReturn> | null)?.familiesFrom
  const familiesFrom = typeof carried === 'string' && carried.startsWith('?') ? carried : ''
  const typesPath = `/app/universes/${universe.id}/types`
  const relationKindsPath = `${typesPath}?tab=relations`

  /** A kind made here joins the list at once: no reload, and the form that asked for it chooses it. */
  function addKind(created: RelationshipType) {
    setKinds((current) => [...(current ?? []), created])
  }

  /** Another entry's family. A button rather than a link, so it asks the leave question itself: an unsaved connection
   *  being added here goes with the family it belonged to. */
  function show(choice: EntityChoice | null) {
    if (!choice || !confirmLeaving()) return
    navigate(`/app/universes/${universe.id}/family-tree/${choice.id}`)
  }

  return (
    <section className="family" aria-labelledby={headingId} data-testid="family-tree-page">
      <PageHeader
        title="Family Tree"
        titleId={headingId}
        lede="Parents, grandparents, siblings, children and grandchildren, worked out from the connections you have recorded. Only a relation kind you have given a family meaning counts."
      />

      {entityId ? (
        <>
          {/* Back to the families: the search and page this tree was opened from, if it was. */}
          <Link
            className="family__browse"
            to={`/app/universes/${universe.id}/family-tree${familiesFrom}`}
            data-testid="family-browse"
          >
            <ArrowLeft className="family__browseicon" aria-hidden="true" focusable="false" />
            Browse families
          </Link>
          <div className="family__picker">
            <EntityPicker
              label={focal ? 'Family shown for' : 'Whose family?'}
              universeId={universe.id}
              value={focal ? { id: focal.entityId, name: focal.name } : null}
              onChange={show}
              familyTreeOnly
              placeholder="Search this universe"
            />
          </div>
        </>
      ) : null}

      {hasEligibleType === false ? (
        <p className="notice" data-testid="family-no-types">
          No Lore Type is enabled for Family Tree yet. A type is enabled for it when it is created,
          under <Link to={typesPath}>Types → Lore Types</Link>.
        </p>
      ) : null}

      {hasEligibleType && kinds !== null && familyKinds.length === 0 ? (
        <div className="notice family__nokinds" data-testid="family-no-kinds">
          <p>
            Family Tree needs a family relation kind: “parent of”, “uncle of”, “married to”. A kind
            means nothing to the tree until you give it a family meaning, whatever it is called.
            Create one here, or give a meaning to an existing kind under{' '}
            <Link to={relationKindsPath}>Types → Relation Kinds</Link>.
          </p>
          {access.editContent ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setIsCreatingKind(true)}
              data-testid="family-new-kind"
            >
              <ActionIcon icon={Plus} />
              New family relationship kind
            </button>
          ) : null}
        </div>
      ) : null}

      {isCreatingKind ? (
        <FamilyKindDialog
          universeId={universe.id}
          onClose={() => setIsCreatingKind(false)}
          onCreated={(created) => {
            addKind(created)
            setIsCreatingKind(false)
          }}
        />
      ) : null}

      {/* No entry in the address: the families already recorded, once there can be any - a type enabled for the tree
          and a kind with a family meaning. Asked for alongside those checks rather than after them. */}
      {view.kind === 'idle' &&
      hasEligibleType !== false &&
      !(kinds !== null && familyKinds.length === 0) ? (
        <FamilyDiscovery universeId={universe.id} canEdit={access.editContent} onChoose={show} />
      ) : null}

      {/* No family kind yet means no family to discover: someone can still be opened, as before, while one is made. */}
      {view.kind === 'idle' && hasEligibleType && kinds !== null && familyKinds.length === 0 ? (
        <div className="family__picker">
          <EntityPicker
            label="Whose family?"
            universeId={universe.id}
            value={null}
            onChange={show}
            familyTreeOnly
            placeholder="Search this universe"
          />
        </div>
      ) : null}

      {view.kind === 'loading' ? (
        <p className="notice" role="status">
          Working out this family…
        </p>
      ) : null}

      {view.kind === 'missing' ? (
        <EmptyState
          testId="family-missing"
          title="That entry is not here."
          hint={
            <>
              It may have been moved to the Trash, deleted, or it belongs to another universe.{' '}
              <Link to={`/app/universes/${universe.id}/lore`}>Back to Lore</Link>
            </>
          }
        />
      ) : null}

      {view.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="family-error">
          <p>{view.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {tree && focal ? (
        <>
          {focal.entityTypeFamilyTreeEligible ? null : (
            <p className="notice" data-testid="family-type-not-enabled">
              This entry&rsquo;s type, <bdi>{focal.entityTypeName}</bdi>, is not currently enabled
              for Family Tree. Its recorded family is still shown here.
            </p>
          )}

          {tree.loops.length > 0 ? (
            <div className="callout callout--warning family__loopnote" data-testid="family-loop">
              <p className="callout__title">These connections go round in a circle</p>
              <p>
                Nobody in it can be placed above the others, so the tree below shows them where it
                can. Nothing has been changed: open the entries and correct or remove one of them.
              </p>
              <ul className="family__loop">
                {tree.loops.flatMap((loop) =>
                  loop.relationshipIds.map((id) => {
                    const link = tree.links.find((candidate) => candidate.relationshipId === id)
                    return link ? (
                      <li key={id} dir="auto">
                        {linkSentence(link, nodes)}
                      </li>
                    ) : null
                  }),
                )}
              </ul>
            </div>
          ) : null}

          <FamilyTreeView
            universeId={universe.id}
            tree={tree}
            onFocus={(next) => show({ id: next, name: '' })}
          />

          <p className="family__note">
            Relatives are worked out from the parent connections themselves, every time this page is
            opened. Nothing on it is stored as a connection of its own, and a sibling here means one
            shared parent that somebody wrote down, and nothing more.
          </p>

          {tree.connections.length > 0 ? (
            <section
              className="family__others"
              aria-labelledby={`${headingId}-others`}
              data-testid="family-other-connections"
            >
              <h2 className="settings__heading" id={`${headingId}-others`}>
                Other family connections
              </h2>
              <p className="settings__note">
                Recorded as you wrote them. They place nobody in the tree above, and imply no other
                relative.
              </p>
              <ul className="family__otherlist">
                {tree.connections.map((connection) => {
                  const other = nodes.get(connection.relatedEntityId)
                  return (
                    <li key={connection.relationshipId} data-testid="family-other-connection">
                      <bdi className="family__othername">{focal.name}</bdi>{' '}
                      <bdi className="family__otherlabel">{connection.label}</bdi>{' '}
                      {other ? (
                        <button
                          className="button button--text family__otherlink"
                          type="button"
                          onClick={() => show({ id: other.entityId, name: other.name })}
                        >
                          <bdi>{other.name}</bdi>
                        </button>
                      ) : null}
                      {connection.canonStatus === CanonStatus.Canon ? null : (
                        <StatusBadge
                          step={connection.canonStatus}
                          label={`${CANON_LABELS[connection.canonStatus]} connection`}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {access.editContent && familyKinds.length > 0 ? (
            isAdding ? (
              <FamilyLinkForm
                universeId={universe.id}
                focal={{ id: focal.entityId, name: focal.name }}
                kinds={familyKinds}
                onKindCreated={addKind}
                onSaved={() => {
                  setAddingFor(null)
                  setReads((current) => current + 1)
                }}
                onCancel={() => setAddingFor(null)}
              />
            ) : (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setAddingFor(entityId ?? null)}
                data-testid="add-family-link"
              >
                <ActionIcon icon={Plus} />
                Add family connection
              </button>
            )
          ) : null}
        </>
      ) : null}
    </section>
  )
}
