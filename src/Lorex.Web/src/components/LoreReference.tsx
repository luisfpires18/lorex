import { Link } from 'react-router-dom'
import { EntityPortrait } from './EntityPortrait'
import { TypeIcon } from './TypeIcon'
import type { SceneLoreReference } from '../stories/types'

/**
 * A lore reference as a story draws it, on a scene or on a plot beat: its type's icon - or, for a point of view,
 * its portrait - and its name, a real link to the entry's own page. An entry in the Trash is named but not linked,
 * because it has no page to open while it is there.
 */
export function LoreReference({
  universeId,
  reference,
  portrait = false,
}: {
  universeId: string
  reference: SceneLoreReference
  portrait?: boolean
}) {
  const className = `lorechip${portrait ? ' lorechip--pov' : ''}`

  const content = (
    <>
      {portrait ? (
        <EntityPortrait
          universeId={universeId}
          entityId={reference.entityId}
          name={reference.name}
          // A trashed entry's picture is not served, so it is drawn as its initial instead.
          image={reference.isTrashed ? null : reference.image}
        />
      ) : (
        <TypeIcon iconKey={reference.entityTypeIcon} className="lorechip__icon" />
      )}
      <span className="lorechip__name">{reference.name}</span>
    </>
  )

  if (reference.isTrashed) {
    return (
      <span className={`${className} lorechip--trashed`} data-testid="lore-reference-trashed">
        {content}
        <span className="lorechip__note">(in Trash)</span>
      </span>
    )
  }

  return (
    <Link
      className={className}
      to={`/app/universes/${universeId}/lore/${reference.entityId}`}
      title={reference.entityTypeName}
      data-testid="lore-reference"
    >
      {content}
    </Link>
  )
}
