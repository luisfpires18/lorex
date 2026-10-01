import { useState } from 'react'
import type { TypeTree } from './typeTree'

/**
 * Which branches are open: the chosen type's ancestors and the type itself to begin with, and every ancestor of a type chosen
 * later added to what the author opened - so the chosen type is never hidden under a closed branch, and nothing the author
 * opened closes behind them. A way of looking, not data: never stored, never in the address.
 */
export function useOpenBranches(tree: TypeTree, selectedId: string | null) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => pathOf(tree, selectedId))
  const [seen, setSeen] = useState({ tree, selectedId })

  if (seen.tree !== tree || seen.selectedId !== selectedId) {
    setSeen({ tree, selectedId })
    const path = pathOf(tree, selectedId)
    if ([...path].some((id) => !open.has(id))) setOpen(new Set([...open, ...path]))
  }

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return { open, toggle }
}

function pathOf(tree: TypeTree, selectedId: string | null) {
  const node = selectedId ? tree.byId.get(selectedId) : undefined
  return new Set(node ? node.path.map((type) => type.id) : [])
}
