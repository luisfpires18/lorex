import type { ReactNode } from 'react'

import { BrandMark } from './BrandMark'
import { MAIN_CONTENT_ID } from './SkipLink'
import { Wordmark } from './Wordmark'

interface AuthLayoutProps {
  heading: string
  intro: string
  children: ReactNode
  footer: ReactNode
}

/**
 * Two-part canvas: a graphite plate carrying the wordmark, and a paper column
 * carrying the form. The plate becomes a slim band on narrow screens.
 */
export function AuthLayout({ heading, intro, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth">
      <aside className="auth__plate">
        <div className="auth__mark">
          {/* The one place the symbol is shown large. On the plate and unbacked: at this size
              the artwork's dark shading reads as modelling rather than as absence, which it
              does not at the size the workspace rail would draw it. */}
          <BrandMark className="brandmark brandmark--plate" />
          <Wordmark large />
          <span className="auth__rule" aria-hidden="true" />
          <p className="auth__pitch">
            A workroom for the worlds you keep — their people, places, history and the rules that
            hold them together.
          </p>
        </div>
      </aside>

      <main className="auth__panel" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <div className="auth__form">
          <h1 className="auth__heading">{heading}</h1>
          <p className="auth__intro">{intro}</p>
          {children}
          <p className="auth__footer">{footer}</p>
        </div>
      </main>
    </div>
  )
}
