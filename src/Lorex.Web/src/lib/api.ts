/** Shape of an RFC 7807 response, plus the field errors ASP.NET Core adds. */
interface ProblemDetails {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}

/** A failed request, carrying per-field messages when the API supplied them. */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function flattenFieldErrors(errors: Record<string, string[]> | undefined) {
  const flattened: Record<string, string> = {}
  for (const [field, messages] of Object.entries(errors ?? {})) {
    if (messages.length > 0) {
      flattened[field.toLowerCase()] = messages[0]
    }
  }
  return flattened
}

/**
 * Calls the API on the same origin. The session cookie is HttpOnly, so the browser
 * attaches it and no token is ever held in JavaScript.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('json') ?? false
  const payload: unknown = isJson ? await response.json() : null

  if (!response.ok) {
    const problem = (payload ?? {}) as ProblemDetails
    const fieldErrors = flattenFieldErrors(problem.errors)
    const message =
      problem.detail ??
      Object.values(fieldErrors)[0] ??
      problem.title ??
      'Something went wrong. Try again.'
    throw new ApiError(response.status, message, fieldErrors)
  }

  return payload as T
}
