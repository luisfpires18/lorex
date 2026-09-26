import {
  BadgeCheck,
  Blocks,
  Compass,
  Feather,
  Hourglass,
  Library,
  Network,
  Scale,
  Settings,
  StickyNote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

export interface Section {
  segment: string
  label: string
  testId: string
  icon: LucideIcon
  /** What the section holds, in a line: the Overview's contents page reads it. */
  purpose: string
}

/**
 * The sections a universe has, in the order the sidebar lists them, grouped as the sidebar spaces
 * them: the front page; the world itself; the writing done with it; its upkeep; its settings. The
 * groups carry no labels - the spacing says it. Held as data rather than as markup because the
 * narrow layout needs the same list twice: once as the list of links, and once to name the
 * section the author is currently in.
 *
 * One icon per section, none shared with an entry type's, each decorative: the label names the
 * destination and is what a screen reader reads.
 */
export const SECTION_GROUPS: readonly (readonly Section[])[] = [
  [
    {
      segment: '',
      label: 'Overview',
      testId: 'workspace-overview',
      icon: Compass,
      purpose: 'This universe at a glance.',
    },
  ],
  [
    {
      segment: 'lore',
      label: 'Lore',
      testId: 'workspace-lore',
      icon: Library,
      purpose: 'Every entry: people, places, things and ideas.',
    },
    {
      segment: 'family-tree',
      label: 'Family Tree',
      testId: 'workspace-family-tree',
      icon: Network,
      purpose: 'Families worked out from recorded connections.',
    },
    {
      segment: 'timeline',
      label: 'Timeline',
      testId: 'workspace-timeline',
      icon: Hourglass,
      purpose: 'What happened, in the order it happened.',
    },
    {
      segment: 'world-rules',
      label: 'World Rules',
      testId: 'workspace-world-rules',
      icon: Scale,
      purpose: 'How this universe works, stated plainly.',
    },
  ],
  [
    {
      segment: 'stories',
      label: 'Stories',
      testId: 'workspace-stories',
      icon: Feather,
      purpose: 'Narratives told with this world, scene by scene.',
    },
    {
      segment: 'ideas',
      label: 'Ideas',
      testId: 'workspace-ideas',
      icon: StickyNote,
      purpose: 'Possibilities, kept apart from the lore.',
    },
  ],
  [
    {
      segment: 'canon',
      label: 'Canon',
      testId: 'workspace-canon',
      icon: BadgeCheck,
      purpose: 'What this world says twice, and differently.',
    },
    {
      segment: 'types',
      label: 'Types',
      testId: 'workspace-types',
      icon: Blocks,
      purpose: 'The kinds of entry and relation this world uses.',
    },
    {
      segment: 'trash',
      label: 'Trash',
      testId: 'workspace-trash',
      icon: Trash2,
      purpose: 'What was removed, waiting to be restored.',
    },
  ],
  [
    {
      segment: 'settings',
      label: 'Settings',
      testId: 'workspace-settings',
      icon: Settings,
      purpose: 'Name, description, chronology and backups.',
    },
  ],
]
