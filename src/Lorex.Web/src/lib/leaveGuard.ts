import { useEffect, useRef } from 'react'
import { NavigationType, useBlocker } from 'react-router-dom'

/** One editor's unsaved work: the question it asks, and what it lets go of when the author leaves it anyway. */
interface Question {
  message: string
  leave: () => void
}

/** Every leave question standing right now, newest last: one per editor holding unsaved work. */
const standing: Question[] = []

/**
 * Asks the newest standing leave question, if there is one, and says whether to go ahead.
 *
 * For an in-app way out that is a button rather than a link - signing out - which the link check in `useLeaveGuard`
 * cannot see, and for the browser's Back and Forward through `HistoryLeaveGuard`. With nothing unsaved anywhere it asks
 * nothing and answers yes. When the author chooses to leave, every editor being left lets its recovery copy go.
 */
export function confirmLeaving() {
  const newest = standing[standing.length - 1]
  if (newest === undefined) return true
  if (!window.confirm(newest.message)) return false

  for (const question of [...standing]) question.leave()
  return true
}

/**
 * Asks before unsaved work is left behind, for as long as `message` is not null.
 *
 * Every way out a person can take asks the same question, once. Following a link: any same-origin `<a>` - which is every
 * in-app navigation a person starts, from the sidebar and the account menu to a story's views and a scene in an outline.
 * Signing out, which is a button, through `confirmLeaving`. The browser's Back and Forward, through `HistoryLeaveGuard`.
 * And leaving the page itself, by reload, close or a typed address, through the browser's own prompt.
 *
 * The link check listens on the document in the capture phase, so it runs before React Router's own click handler and
 * can cancel the click outright when the author chooses to stay. The question is the browser's own dialog, which a
 * keyboard and a screen reader already know how to answer.
 *
 * `onLeave` runs when the author answers that they do mean to leave without saving - a choice made in the app, so the
 * editor's recovery copy goes with the writing rather than coming back next time as something to recover. Leaving the
 * page itself is not that choice: the browser's own prompt cannot say what was answered, and a closed tab is exactly
 * what a recovery copy is for, so it stays (ADR 0029).
 */
export function useLeaveGuard(message: string | null, onLeave?: () => void) {
  const leave = useRef(onLeave)

  useEffect(() => {
    leave.current = onLeave
  })

  useEffect(() => {
    if (message === null) return

    const question: Question = { message, leave: () => leave.current?.() }
    standing.push(question)

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

      if (window.confirm(question.message)) {
        question.leave()
      } else {
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
      const at = standing.indexOf(question)
      if (at >= 0) standing.splice(at, 1)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [message])
}

/**
 * Holds the browser's Back and Forward while any leave question is standing, and asks it.
 *
 * Mounted once, inside the router: a router holds one blocker at a time, and every editor's question is already in
 * `standing`, read when the navigation happens rather than when this rendered. It holds history moves only. A link has
 * already asked, in `useLeaveGuard`'s click check, before React Router sees the click; Sign out has already asked, in
 * `confirmLeaving`, before it navigates; so neither is asked twice.
 *
 * React Router does the undoing, which is why the app runs on a data router (ADR 0028): a held move is put back at once,
 * so while the question is open the address is still the page being written on. Staying changes nothing - no route
 * changed, so the editor, its text and its focus are exactly as they were. Leaving makes the same move again. A move back
 * to a page from before Lorex loaded leaves the page itself, and the browser's own prompt asks about that instead.
 */
export function HistoryLeaveGuard() {
  const blocker = useBlocker(
    ({ historyAction }) => historyAction === NavigationType.Pop && standing.length > 0,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return

    if (confirmLeaving()) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  return null
}
