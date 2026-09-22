import { useOutletContext } from 'react-router-dom'
import { formatDate } from '../lib/dates'
import type { WorkspaceContext } from './UniverseWorkspace'

export default function UniverseOverview() {
  const { universe } = useOutletContext<WorkspaceContext>()

  return (
    <article className="overview">
      <header className="overview__head">
        <h2 className="overview__title" data-testid="overview-name">
          <bdi>{universe.name}</bdi>
        </h2>
        {universe.description ? (
          <p className="overview__description">{universe.description}</p>
        ) : (
          <p className="overview__description overview__description--empty">
            No description yet. Settings is where you give this world its opening line.
          </p>
        )}
        <p className="overview__meta">
          Created {formatDate(universe.createdAt)}, last changed {formatDate(universe.updatedAt)}
        </p>
      </header>

      <section className="overview__stage" aria-label="Working area">
        <p className="overview__waiting">Your lore will appear here.</p>
      </section>
    </article>
  )
}
