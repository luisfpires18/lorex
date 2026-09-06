import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Field } from '../components/Field'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'

export default function LoginPage() {
  const { logIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const destination = (location.state as { from?: string } | null)?.from ?? '/app'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setIsSubmitting(true)

    try {
      await logIn({ usernameOrEmail, password })
      await navigate(destination, { replace: true })
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'Sign-in is unavailable right now.')
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      heading="Sign in"
      intro="Pick up where your world left off."
      footer={
        <>
          No account yet? <Link to="/register">Create account</Link>
        </>
      }
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {message ? (
          <p className="form__message" role="alert" data-testid="auth-error">
            {message}
          </p>
        ) : null}

        <Field
          label="Username or email"
          name="usernameOrEmail"
          autoComplete="username"
          autoFocus
          required
          value={usernameOrEmail}
          onChange={(event) => setUsernameOrEmail(event.target.value)}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
