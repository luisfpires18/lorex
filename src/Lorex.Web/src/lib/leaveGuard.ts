import { useEffect } from 'react'

/**
 * Asks before unsaved work is left behind, for as long as `message` is not null.
 *
 * Lorex runs on a plain `BrowserRouter`, where React Router's navigation blocker is not available, so this covers the
 * two ways out that can be caught. Following a link: any same-origin `<a>` - which is every in-app navigation a person
 * starts, from the sidebar and the account menu to a story's views and a scene in an outline. And leaving the page
 * itself, by reload, close or a typed address, through the browser's own prompt. The browser's Back and Forward buttons
 * are not caught.
 *
 * The link check listens on the document in the capture phase, so it runs before React Router's own click handler and
 * can cancel the click outright when the author chooses to stay. The question is the browser's own dialog, which a
 * keyboard and a screen reader already know how to answer.
 */
export function useLeaveGuard(message: string | null) {
  useEffect(() => {
    if (message === null) return

    function onClick(event: MouseEvent) {
      // A modified click opens a new tab or window, which leaves nothing behind.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement)) return
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return

      // A link to where the author already is - a jump within the page, or the scene already open - leaves nothing.
      const next = new URL(anchor.href, window.location.href)
      if (
        next.origin === window.location.origin &&
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      ) {
        return
      }

      if (!window.confirm(message ?? '')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // Still required by some browsers before they show their prompt; the text itself is never shown.
      event.returnValue = ''
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [message])
}
