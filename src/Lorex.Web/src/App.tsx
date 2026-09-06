import { useEffect, useState } from 'react'

type ApiStatus =
  | { kind: 'checking' }
  | { kind: 'online'; service: string; version: string }
  | { kind: 'offline'; reason: string }

interface HealthResponse {
  status: string
  service: string
  version: string
  timestampUtc: string
}

function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>({ kind: 'checking' })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`API responded ${response.status}`)
        }
        const body = (await response.json()) as HealthResponse
        setStatus({ kind: 'online', service: body.service, version: body.version })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStatus({
          kind: 'offline',
          reason: error instanceof Error ? error.message : 'unreachable',
        })
      })

    return () => {
      controller.abort()
    }
  }, [])

  return status
}

export default function App() {
  const status = useApiStatus()

  return (
    <main className="shell">
      <h1 data-testid="app-title">Lorex</h1>
      <p className="tagline">Repository bootstrap. No product features yet.</p>
      <p className="status" data-testid="api-status" data-state={status.kind}>
        {status.kind === 'checking' && 'Checking API…'}
        {status.kind === 'online' && `API online — ${status.service} v${status.version}`}
        {status.kind === 'offline' && `API unreachable — ${status.reason}`}
      </p>
    </main>
  )
}
