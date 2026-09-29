import { useOutletContext } from 'react-router-dom'
import { ChronologyEditor } from '../components/ChronologyEditor'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * A universe's chronology as a workspace section of its own, beside World Rules: the eras its dates are written and
 * ordered in (ADR 0022). Worldbuilding, not configuration - so it left Settings (follow-up to UI refinement 014). The
 * editor, its whole-list save, its preview, its refusals and its leave guard are exactly what they were; only where it
 * lives changed.
 */
export default function ChronologyPage() {
  const { universe, chronology, setChronology } = useOutletContext<WorkspaceContext>()

  return (
    <article className="chronologypage" data-testid="chronology-page">
      <ChronologyEditor universeId={universe.id} chronology={chronology} onSaved={setChronology} />
    </article>
  )
}
