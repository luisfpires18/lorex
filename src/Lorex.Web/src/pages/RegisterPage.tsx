import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Field } from '../components/Field'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setFieldErrors({ confirmpassword: 'Both passwords need to match.' })
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)

    try {
      await register({ username, email, password })
      await navigate('/app', { replace: true })
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.keys(error.fieldErrors).length === 0) {
          setMessage(error.message)
        }
      } else {
        setMessage('Registration is unavailable right now.')
      }
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      heading="Create account"
      intro="Claim a name, and the workroom is yours."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
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
          label="Username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          value={username}
          error={fieldErrors.username}
          onChange={(event) => setUsername(event.target.value)}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          error={fieldErrors.confirmpassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
