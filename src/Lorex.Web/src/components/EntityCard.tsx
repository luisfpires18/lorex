import { Link } from 'react-router-dom'
import { EntityPortrait } from './EntityPortrait'
import { CANON_LABELS, type EntitySummary } from '../lore/types'

/**
 * A dossier card. What it shows depends on what the entity actually has, so a Character
 * with three aliases and a Concept with none do not look like the same row.
 *
 * The portrait is the one exception to that rule: every card carries the same slot whether or
 * not there is a picture in it, because a grid that reflowed as thumbnails arrived would be
 * worse than one that never showed them.
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

      <span className="dossier__title">
        <EntityPortrait
          universeId={universeId}
          entityId={entity.id}
          name={entity.name}
          image={entity.image}
        />

        <span className="dossier__titletext">
          <span className="dossier__name">{entity.name}</span>

          {entity.aliases.length > 0 ? (
            <span className="dossier__aliases">also {entity.aliases.join(', ')}</span>
          ) : null}
        </span>
      </span>

      {entity.summary ? <span className="dossier__summary">{entity.summary}</span> : null}

      {/* Why a search found it, when the article is where: plain runs of text, the matched words marked. */}
      {entity.articleExcerpt ? (
        <span className="dossier__excerpt" data-testid="entity-excerpt">
          <span className="dossier__excerptlabel">In the article</span>
          <span className="dossier__excerpttext">
            {entity.articleExcerpt.map((part, index) =>
              part.isMatch ? (
                <mark key={index}>{part.text}</mark>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </span>
        </span>
      ) : null}

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
