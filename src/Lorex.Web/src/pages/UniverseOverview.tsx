import { Link, useOutletContext } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { formatDate } from '../lib/dates'
import { SECTION_GROUPS } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'

/** The contents page's three parts: the sidebar's groups between the front page and Settings. */
const CONTENTS = [
  { heading: 'World', sections: SECTION_GROUPS[1] },
  { heading: 'Writing', sections: SECTION_GROUPS[2] },
  { heading: 'Keeping', sections: SECTION_GROUPS[3] },
]

/**
 * A universe's front page, set as a book's contents: its name and opening line, then a doorway into
 * each part of it, grouped as the sidebar groups them. No feed, no recent items, no counts - a
 * count would mean reading every list just to print a number, and a contents page does not need
 * one to say where things are.
 */
export default function UniverseOverview() {
  const { universe } = useOutletContext<WorkspaceContext>()

  return (
    <article className="overview">
      <PageHeader
        title={<bdi>{universe.name}</bdi>}
        titleTestId="overview-name"
        lede={
          <>
            {universe.description ? (
              <p className="overview__description prose">{universe.description}</p>
            ) : (
              <p className="overview__description">
                No description yet. <Link to="settings">Settings</Link> is where you give this world
                its opening line.
              </p>
            )}
            <p className="overview__meta">
              Created {formatDate(universe.createdAt)}, last changed{' '}
              {formatDate(universe.updatedAt)}
            </p>
          </>
        }
      />

      {CONTENTS.map(({ heading, sections }) => (
        <section className="contents" key={heading} aria-labelledby={`contents-${heading}`}>
          <h2 className="contents__heading" id={`contents-${heading}`}>
            {heading}
          </h2>
          <ul className="contents__list">
            {sections.map(({ segment, label, icon: Icon, purpose }) => (
              <li key={segment}>
                <Link className="doorway" to={segment} data-testid={`overview-${segment}`}>
                  <Icon
                    className="doorway__icon"
                    aria-hidden="true"
                    focusable="false"
                    strokeWidth={1.75}
                  />
                  <span className="doorway__name">{label}</span>
                  <span className="doorway__purpose">{purpose}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  )
}
