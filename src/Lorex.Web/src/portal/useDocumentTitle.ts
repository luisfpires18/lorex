import { useEffect } from 'react'

const BRAND = 'Lorex'

/**
 * The tab's title while a portal page is shown, in the same words the server writes into the page's head (ADR 0038) -
 * so a page reached by a link inside the app reads as one reached from outside. Put back when the page goes.
 */
export function useDocumentTitle(...parts: string[]) {
  const full = `${parts.filter(Boolean).join(' — ')} | ${BRAND}`
  useEffect(() => {
    const previous = document.title
    document.title = full
    return () => {
      document.title = previous
    }
  }, [full])
}
