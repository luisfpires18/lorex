import { useEffect } from 'react'

/** Every leave question standing right now, newest last: one per editor holding unsaved work. */
const standing: string[] = []

/**
 * Asks the newest standing leave question, if there is one, and says whether to go ahead.
 *
 * For an in-app way out that is a button rather than a link - signing out - which the link check in `useLeaveGuard`
 * cannot see. With nothing unsaved anywhere it asks nothing and answers yes.
 */
export function confirmLeaving() {
  const message = standing[standing.length - 1]
  return message === undefined || window.confirm(message)
}

/**
 * Asks before unsaved work is left behind, for as long as `message` is not null.
 *
 * Lorex runs on a plain `BrowserRouter`, where React Router's navigation blocker is not available, so this covers the
 * ways out that can be caught. Following a link: any same-origin `<a>` - which is every in-app navigation a person
 * starts, from the sidebar and the account menu to a story's views and a scene in an outline. Signing out, which is a
 * button, through `confirmLeaving`. And leaving the page itself, by reload, close or a typed address, through the
 * browser's own prompt.
 *
 * The browser's Back and Forward buttons are not caught. A pop cannot be cancelled, only undone by moving the history
 * again, and the one well-tested way to do that - a data router's blocker - is a change to how the whole app routes,
 * not to this editor (ADR 0027).
 *
 * The link check listens on the document in the capture phase, so it runs before React Router's own click handler and
 * can cancel the click outright when the author chooses to stay. The question is the browser's own dialog, which a
 * keyboard and a screen reader already know how to answer.
 */
export function useLeaveGuard(message: string | null) {
  useEffect(() => {
    if (message === null) return

    standing.push(message)

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
      const at = standing.lastIndexOf(message)
      if (at >= 0) standing.splice(at, 1)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [message])
}
