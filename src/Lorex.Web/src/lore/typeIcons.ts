import {
  BookOpen,
  CalendarDays,
  Castle,
  Crown,
  Gem,
  Leaf,
  Lightbulb,
  MapPin,
  Mountain,
  Package,
  PawPrint,
  Shapes,
  Shield,
  Ship,
  Sparkles,
  Sword,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface TypeIconOption {
  /** What is stored on the type and sent to the API. Never shown. */
  key: string
  /** What the picture shows, for a screen reader and a tooltip. Not what the type means. */
  label: string
  glyph: LucideIcon
}

/**
 * The icons an entity type may carry, in the order the picker offers them.
 *
 * Mirrors `EntityTypeIcons.Keys` on the API, which refuses any other key, so the two lists change
 * together and a key is never removed or renamed once shipped - it is stored and exported (ADR 0020).
 * The first seven are the keys the starter types have always been seeded with; the rest name the
 * picture they show.
 *
 * A key is a picture and nothing more. Nothing here, or anywhere, chooses one from a type's name.
 */
export const TYPE_ICONS: readonly TypeIconOption[] = [
  { key: 'character', label: 'Person', glyph: User },
  { key: 'organization', label: 'Group', glyph: Users },
  { key: 'crown', label: 'Crown', glyph: Crown },
  { key: 'castle', label: 'Castle', glyph: Castle },
  { key: 'location', label: 'Map pin', glyph: MapPin },
  { key: 'mountain', label: 'Mountain', glyph: Mountain },
  { key: 'event', label: 'Calendar', glyph: CalendarDays },
  { key: 'sword', label: 'Sword', glyph: Sword },
  { key: 'shield', label: 'Shield', glyph: Shield },
  { key: 'item', label: 'Package', glyph: Package },
  { key: 'gem', label: 'Gem', glyph: Gem },
  { key: 'species', label: 'Paw print', glyph: PawPrint },
  { key: 'leaf', label: 'Leaf', glyph: Leaf },
  { key: 'concept', label: 'Lightbulb', glyph: Lightbulb },
  { key: 'sparkles', label: 'Sparkles', glyph: Sparkles },
  { key: 'book', label: 'Book', glyph: BookOpen },
  { key: 'ship', label: 'Ship', glyph: Ship },
]

/** Drawn for a type with no icon, and for a key this build does not know. Neutral on purpose. */
export const FALLBACK_TYPE_GLYPH: LucideIcon = Shapes

const BY_KEY = new Map(TYPE_ICONS.map((option) => [option.key, option]))

/** The option for a stored key, or null when there is none or the key is not one this build draws. */
export function typeIconOption(key: string | null): TypeIconOption | null {
  return key ? (BY_KEY.get(key) ?? null) : null
}
