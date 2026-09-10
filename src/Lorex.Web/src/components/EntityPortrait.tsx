import { entityImageUrl } from '../lore/images'
import type { EntityImageRef } from '../lore/types'

/**
 * The small square portrait a card carries.
 *
 * It always occupies the same space, image or no image. A grid where some cards have a picture
 * and some do not would otherwise reflow line by line as the thumbnails arrive, and the lore
 * browser is the screen that is scrolled most - so an entry without one falls back to its
 * initial on the type's accent rather than to nothing at all. The slot is CSS, not the image,
 * which is what keeps the card's height fixed before a byte has loaded.
 */
export function EntityPortrait({
  universeId,
  entityId,
  name,
  image,
}: {
  universeId: string
  entityId: string
  name: string
  image: EntityImageRef | null
}) {
  if (!image) {
    return (
      <span
        className="portrait portrait--blank"
        aria-hidden="true"
        data-testid="entity-portrait-blank"
      >
        {initial(name)}
      </span>
    )
  }

  return (
    <img
      className="portrait"
      src={entityImageUrl(universeId, entityId, image, 'thumbnail')}
      // Decorative beside the name it belongs to: a screen reader that announced "portrait of
      // Alenna Vance" right before "Alenna Vance" would only say it twice.
      alt=""
      loading="lazy"
      decoding="async"
      width={320}
      height={320}
      data-testid="entity-portrait"
    />
  )
}

/** The first character an author actually wrote, so an emoji or a non-Latin name survives. */
function initial(name: string) {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}
