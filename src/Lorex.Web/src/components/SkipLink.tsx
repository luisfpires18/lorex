/** The id of the one `main` every layout draws, and the place the skip link lands. */
export const MAIN_CONTENT_ID = 'main-content'

/**
 * "Skip to main content": first in the tab order on every screen, hidden until focused.
 *
 * Rendered once, above the routes, so no screen carries its own. Activating it moves the focus
 * rather than the address: a `#main-content` in the URL would be a history entry the leave guard
 * and Back would both have to reason about, for a jump that is only about the keyboard.
 */
export function SkipLink() {
  return (
    <a
      className="skiplink"
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        const main = document.getElementById(MAIN_CONTENT_ID)
        if (!main) return
        event.preventDefault()
        main.focus()
      }}
      data-testid="skip-link"
    >
      Skip to main content
    </a>
  )
}
