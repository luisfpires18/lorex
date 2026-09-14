import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { IdeaEditor } from '../components/IdeaEditor'
import type { IdeasListNotice } from '../components/IdeasBrowser'
import { IdeasHome } from './IdeasPage'
import type { WorkspaceContext } from './UniverseWorkspace'

interface IdeaPageProps {
  inUniverse?: boolean
  isNew?: boolean
}

/**
 * One idea, new or saved, globally at `/app/ideas/...` or inside a universe's workspace. A new idea started inside a
 * universe starts in that universe; its author may take it out again before saving.
 */
export default function IdeaPage({ inUniverse = false, isNew = false }: IdeaPageProps) {
  const { ideaId } = useParams<{ ideaId: string }>()
  const navigate = useNavigate()
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null
  const listPath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'

  const editor = (
    <IdeaEditor
      // A different idea - or the new one becoming saved - is a different editor, starting from nothing.
      key={isNew ? 'new' : ideaId}
      ideaId={isNew ? null : (ideaId ?? null)}
      defaultUniverseId={universe?.id ?? null}
      contextUniverse={universe ? { id: universe.id, name: universe.name } : null}
      listPath={listPath}
      listLabel={universe ? `Ideas in “${universe.name}”` : 'All ideas'}
      onCreated={(idea) => void navigate(`${listPath}/${idea.id}`, { replace: true })}
      onDeleted={(idea) =>
        void navigate(listPath, { state: { deleted: idea } satisfies IdeasListNotice })
      }
    />
  )

  return universe ? editor : <IdeasHome>{editor}</IdeasHome>
}
