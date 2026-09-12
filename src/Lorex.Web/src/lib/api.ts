/**
 * Shape of an RFC 7807 response, plus the field errors ASP.NET Core adds and the
 * extensions this API flattens alongside them. `code` is a stable machine-readable
 * marker on the refusals that carry one, so a client never has to match prose.
 */
interface ProblemDetails {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
  code?: string
}

/**
 * A failed request, carrying per-field messages when the API supplied them.
 *
 * `code` and `problem` exist for the refusals that say more than a sentence. The whole
 * body is kept rather than parsed here, because what a given code carries alongside it is
 * that feature's business - see `canon/blocked.ts` for the one case that has any.
 */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>
  readonly code: string | null
  readonly problem: unknown

  constructor(
    status: number,
    message: string,
    fieldErrors: Record<string, string> = {},
    code: string | null = null,
    problem: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
    this.problem = problem
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
 * One failed response, read the same way whichever transport carried it.
 *
 * Exported because the upload helper in `lib/upload.ts` uses `XMLHttpRequest` rather than
 * `fetch` - it is the only way to see byte progress - and a failure there has to become exactly
 * the `ApiError` every caller already handles.
 */
export function apiErrorFrom(status: number, payload: unknown) {
  const problem = (payload ?? {}) as ProblemDetails
  const fieldErrors = flattenFieldErrors(problem.errors)
  const message =
    problem.detail ??
    Object.values(fieldErrors)[0] ??
    problem.title ??
    'Something went wrong. Try again.'

  return new ApiError(status, message, fieldErrors, problem.code ?? null, payload)
}

/**
 * Calls the API on the same origin. The session cookie is HttpOnly, so the browser
 * attaches it and no token is ever held in JavaScript.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // A FormData body carries its own multipart content type, complete with the boundary the
  // browser generated. Declaring JSON over it would make the request unparseable, so the
  // default only applies to the JSON bodies every other call sends.
  const isForm = init?.body instanceof FormData

  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init?.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('json') ?? false
  const payload: unknown = isJson ? await response.json() : null

  if (!response.ok) {
    throw apiErrorFrom(response.status, payload)
  }

  return payload as T
}
