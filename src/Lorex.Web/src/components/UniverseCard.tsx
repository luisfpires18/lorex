import { Link } from 'react-router-dom'
import { formatDate } from '../lib/dates'
import { ROLE_LABELS } from '../universes/access'
import { UniverseRole, type UniverseSummary } from '../universes/types'

/**
 * A plate rather than a card: a spine in the universe's own colour, the name set in the
 * display face, and nothing invented. No counts, no fake activity.
 *
 * A universe someone else owns says so quietly at its foot - "Shared · Editor" - in the meta line's own small muted type,
 * never beside the name. One the account owns carries no badge: owning is the ordinary case.
 */
export function UniverseCard({ universe }: { universe: UniverseSummary }) {
  return (
    <Link
      className="plate"
      to={`/app/universes/${universe.id}`}
      style={
        universe.accentColor ? { ['--plate-accent' as string]: universe.accentColor } : undefined
      }
      data-testid="universe-card"
      data-universe-name={universe.name}
    >
      <span className="plate__spine" aria-hidden="true" />
      <span className="plate__body">
        <span className="plate__name">
          <bdi>{universe.name}</bdi>
        </span>
        {universe.description ? (
          <span className="plate__description prose">{universe.description}</span>
        ) : (
          <span className="plate__description plate__description--empty">No description yet</span>
        )}
        <span className="plate__meta">
          <span>Updated {formatDate(universe.updatedAt)}</span>
          {universe.accessRole !== UniverseRole.Owner || universe.isArchived ? (
            <span className="plate__marks">
              {universe.accessRole !== UniverseRole.Owner ? (
                <span className="plate__role" data-testid="universe-card-role">
                  Shared · {ROLE_LABELS[universe.accessRole]}
                </span>
              ) : null}
              {universe.isArchived ? <span className="plate__archived">Archived</span> : null}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  )
}
