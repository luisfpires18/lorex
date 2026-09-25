import { Link } from 'react-router-dom'
import { formatDate } from '../lib/dates'
import type { UniverseSummary } from '../universes/types'

/**
 * A plate rather than a card: a spine in the universe's own colour, the name set in the
 * display face, and nothing invented. No counts, no fake activity.
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
          {universe.isArchived ? <span className="plate__archived">Archived</span> : null}
        </span>
      </span>
    </Link>
  )
}
