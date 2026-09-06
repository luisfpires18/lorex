import type { ReactNode } from 'react'

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
          <span className="wordmark wordmark--large">Lorex</span>
          <span className="auth__rule" aria-hidden="true" />
          <p className="auth__pitch">
            A workroom for the worlds you keep — their people, places, history and the rules that
            hold them together.
          </p>
        </div>
      </aside>

      <main className="auth__panel">
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
