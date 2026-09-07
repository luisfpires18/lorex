import { Link } from 'react-router-dom'
import { CANON_LABELS, type EntitySummary } from '../lore/types'

/**
 * A dossier card. What it shows depends on what the entity actually has, so a Character
 * with three aliases and a Concept with none do not look like the same row.
 */
export function EntityCard({ universeId, entity }: { universeId: string; entity: EntitySummary }) {
  const accent = entity.entityTypeAccentColor ?? undefined

  return (
    <Link
      className="dossier"
      to={`/app/universes/${universeId}/lore/${entity.id}`}
      style={accent ? { ['--dossier-accent' as string]: accent } : undefined}
      data-testid="entity-card"
      data-entity-name={entity.name}
    >
      <span className="dossier__head">
        <span className="dossier__type">{entity.entityTypeName}</span>
        <span className="dossier__canon" data-canon={entity.canonStatus}>
          {CANON_LABELS[entity.canonStatus]}
        </span>
      </span>

      <span className="dossier__name">{entity.name}</span>

      {entity.aliases.length > 0 ? (
        <span className="dossier__aliases">also {entity.aliases.join(', ')}</span>
      ) : null}

      {entity.summary ? <span className="dossier__summary">{entity.summary}</span> : null}

      {entity.tags.length > 0 ? (
        <span className="dossier__tags">
          {entity.tags.map((tag) => (
            <span className="chip" key={tag}>
              {tag}
            </span>
          ))}
        </span>
      ) : null}
    </Link>
  )
}
