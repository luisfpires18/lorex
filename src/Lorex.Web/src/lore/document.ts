import { FieldKind, type FieldDefinition, type FieldValueInput } from './types'

/** Schemes an article link may use. The API enforces the same set. */
export const ALLOWED_LINK_SCHEMES = ['http', 'https', 'mailto']

export function isSafeHref(href: string) {
  const trimmed = href.trim()
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true
  const separator = trimmed.indexOf(':')
  if (separator <= 0) return true
  return ALLOWED_LINK_SCHEMES.includes(trimmed.slice(0, separator).toLowerCase())
}

/** An empty Tiptap document still serialises, so treat one with no content as no article. */
export function isEmptyDocument(json: string | null): boolean {
  if (!json) return true
  try {
    const parsed = JSON.parse(json) as { content?: unknown[] }
    return !parsed.content || parsed.content.length === 0
  } catch {
    return true
  }
}

/** The starting value for a field the entity has never had one for. */
export function emptyValue(definition: FieldDefinition): FieldValueInput {
  const isText = definition.kind === FieldKind.ShortText || definition.kind === FieldKind.LongText

  return {
    fieldDefinitionId: definition.id,
    text: isText ? (definition.defaultValue ?? null) : null,
    number: null,
    boolean: definition.kind === FieldKind.Boolean ? false : null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
  }
}
