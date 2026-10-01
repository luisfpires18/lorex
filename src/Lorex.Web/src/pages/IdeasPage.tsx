import { useOutletContext } from 'react-router-dom'
import { IdeasBrowser } from '../components/IdeasBrowser'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * Ideas: every idea the account has at `/app/ideas`, or one universe's inside its workspace. One list either way
 * (`IdeasBrowser`) - not two idea systems.
 */
export default function IdeasPage({ inUniverse = false }: { inUniverse?: boolean }) {
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null

  if (universe) {
    return (
      <IdeasBrowser
        universe={{ id: universe.id, name: universe.name }}
        basePath={`/app/universes/${universe.id}/ideas`}
      />
    )
  }

  return <IdeasBrowser universe={null} basePath="/app/ideas" />
}
