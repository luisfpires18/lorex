/** The bounds a world rule is held to, mirrored from the API's `WorldRuleLimits` so a form says so before a save. */
export const WORLD_RULE_TITLE_MAX_LENGTH = 200
export const WORLD_RULE_DESCRIPTION_MAX_LENGTH = 10_000

/** A list row: a rule's title and the start of its description, never all of it. */
export interface WorldRuleSummary {
  id: string
  title: string
  excerpt: string
  isExcerptShortened: boolean
  createdAt: string
  updatedAt: string
}

export interface WorldRulePage {
  items: WorldRuleSummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/**
 * One rule, whole: what the author wrote and when. Nothing derived travels with it - no status, no finding, no "valid" flag -
 * because nothing reads a rule's words (ADR 0033).
 */
export interface WorldRuleDetail {
  id: string
  title: string
  description: string
  createdAt: string
  updatedAt: string
}

/** A create, or a whole save naming the `updatedAt` it was written over. */
export interface WorldRuleInput {
  title: string
  description: string
  expectedUpdatedAt: string | null
}
