import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EntityPicker, type EntityChoice } from '../components/EntityPicker'
import { FamilyLinkForm } from '../components/FamilyLinkForm'
import { FamilyTreeView } from '../components/FamilyTreeView'
import { getFamilyTree } from '../familyTree/api'
import { linkSentence } from '../familyTree/reading'
import type { FamilyTree } from '../familyTree/types'
import { listRelationshipTypes } from '../relationships/api'
import { FamilySemantic, type RelationshipType } from '../relationships/types'
import type { WorkspaceContext } from './UniverseWorkspace'

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
 * an author gave a family meaning, and this page reads them rather than being a second place to keep them.
 */
export default function FamilyTreePage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const headingId = useId()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [kinds, setKinds] = useState<RelationshipType[] | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [reads, setReads] = useState(0)

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
  const typesPath = `/app/universes/${universe.id}/types`

  function show(choice: EntityChoice | null) {
    if (choice) navigate(`/app/universes/${universe.id}/family-tree/${choice.id}`)
  }

  return (
    <section className="family" aria-labelledby={headingId} data-testid="family-tree-page">
      <header className="chron__head">
        <div>
          <h2 className="chron__title" id={headingId}>
            Family Tree
          </h2>
          <p className="chron__lede">
            Parents, grandparents, siblings, children and grandchildren, worked out from the
            connections you have recorded. Only a relation kind you have given a family meaning
            counts.
          </p>
        </div>
      </header>

      <div className="family__picker">
        <EntityPicker
          label={focal ? 'Family shown for' : 'Whose family?'}
          universeId={universe.id}
          value={focal ? { id: focal.entityId, name: focal.name } : null}
          onChange={show}
          placeholder="Search this universe"
        />
      </div>

      {kinds !== null && familyKinds.length === 0 ? (
        <p className="notice" data-testid="family-no-kinds">
          No relation kind has a family meaning yet. Give one to a kind under{' '}
          <Link to={typesPath}>Types</Link> — a kind called “parent of” means nothing until you say
          it does.
        </p>
      ) : null}

      {view.kind === 'idle' ? (
        <div className="empty" data-testid="family-empty">
          <p className="empty__line">Choose an entry to see its family.</p>
          <p className="empty__hint">
            Any entry can have one: Lorex never decides which of them are people. Record a
            connection of a kind that means “parent”, and the tree grows from it.
          </p>
        </div>
      ) : null}

      {view.kind === 'loading' ? (
        <p className="notice" role="status">
          Working out this family…
        </p>
      ) : null}

      {view.kind === 'missing' ? (
        <div className="empty" data-testid="family-missing">
          <p className="empty__line">That entry is not here.</p>
          <p className="empty__hint">
            It may have been moved to the Trash, deleted, or it belongs to another universe.{' '}
            <Link to={`/app/universes/${universe.id}/lore`}>Back to Lore</Link>
          </p>
        </div>
      ) : null}

      {view.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="family-error">
          <p>{view.message}</p>
          <button
            className="button button--quiet"
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
          {tree.loops.length > 0 ? (
            <div className="notice notice--error" role="alert" data-testid="family-loop">
              <p>
                These connections go round in a circle, so nobody in it can be placed above the
                others. Nothing has been changed: open the entries and correct or remove one of
                them.
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
            shared parent that somebody wrote down — no more than that.
          </p>

          {familyKinds.length > 0 ? (
            isAdding ? (
              <FamilyLinkForm
                universeId={universe.id}
                focal={{ id: focal.entityId, name: focal.name }}
                kinds={familyKinds}
                onSaved={() => {
                  setAddingFor(null)
                  setReads((current) => current + 1)
                }}
                onCancel={() => setAddingFor(null)}
              />
            ) : (
              <button
                className="button button--quiet button--icon"
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
