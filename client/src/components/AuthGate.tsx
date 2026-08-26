import { useEffect, useState, type ReactNode } from 'react'
import { setUnauthorizedHandler } from '../api/client.ts'
import {
  getToken,
  setToken,
  useAuthStatus,
  useBootstrap,
  useLogin,
} from '../api/auth.ts'

/**
 * Stands in front of the application when the server wants a session.
 *
 * Three states, and which one shows is decided by the server rather than
 * guessed: no authentication at all, an account to create, or a password to
 * enter. The client cannot work out the middle one on its own, which is why
 * /auth/status reports it.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStatus()
  const [signedIn, setSignedIn] = useState(() => getToken() !== null)

  useEffect(() => {
    // One place to react to an expired or revoked session, instead of every
    // panel rendering its own error about it.
    setUnauthorizedHandler(() => {
      setToken(null)
      setSignedIn(false)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  if (status.isLoading) {
    return <Centred>Checking…</Centred>
  }

  if (status.isError) {
    // Almost always the server not running, which is worth saying plainly
    // rather than showing an empty sign-in form that cannot possibly work.
    return (
      <Centred>
        <p className="font-medium dark:text-gray-100">Cannot reach the server.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Start it and reload this page.
        </p>
      </Centred>
    )
  }

  if (!status.data?.auth_required) return <>{children}</>
  if (signedIn) return <>{children}</>

  return (
    <Centred>
      <SignIn
        needsBootstrap={status.data.needs_bootstrap}
        onSignedIn={() => setSignedIn(true)}
      />
    </Centred>
  )
}

function Centred({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="w-full max-w-sm text-center">{children}</div>
    </div>
  )
}

function SignIn({
  needsBootstrap,
  onSignedIn,
}: {
  needsBootstrap: boolean
  onSignedIn: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const login = useLogin()
  const bootstrap = useBootstrap()
  const action = needsBootstrap ? bootstrap : login

  // The server's floor, repeated here so the message arrives before the round
  // trip rather than after it.
  const tooShort = needsBootstrap && password.length > 0 && password.length < 12

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    action.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => onSignedIn(),
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not sign in'),
      },
    )
  }

  return (
    <form onSubmit={submit} className="text-left space-y-4">
      <div>
        <h1 className="text-xl font-semibold dark:text-gray-100">
          {needsBootstrap ? 'Create your account' : 'Sign in'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {needsBootstrap
            ? 'This server has no accounts yet. The first one is yours.'
            : 'This server is reachable from the network, so it asks who you are.'}
        </p>
      </div>

      <label className="block">
        <span className="text-xs text-gray-600 dark:text-gray-400">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <div>
        <label className="block">
          <span className="text-xs text-gray-600 dark:text-gray-400">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
            aria-describedby={needsBootstrap ? 'password-hint' : undefined}
            required
            className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        {/* Described by, not labelled by. Inside the <label> this hint becomes
            part of the field's accessible name, so a screen reader announces
            the whole sentence every time the field is focused, and the field is
            no longer findable as "Password". */}
        {needsBootstrap && (
          <span
            id="password-hint"
            className={`text-xs mt-1 block ${
              tooShort ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            At least 12 characters. Length is what makes a password expensive to guess.
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={action.isPending || !username.trim() || !password || tooShort}
        className="w-full px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        {action.isPending
          ? 'Working…'
          : needsBootstrap
            ? 'Create account'
            : 'Sign in'}
      </button>
    </form>
  )
}
