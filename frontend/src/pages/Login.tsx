import { ArrowLeft, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import { showToast } from '@/utils/toast'

type LoginStep = 'password' | 'totp'

interface LoginResult {
  status: 'success' | 'error' | 'totp_required'
  message?: string
  broker?: string
  redirect?: string
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/auth/csrf-token', { credentials: 'include' })
  if (!response.ok) throw new Error('Unable to start a secure sign-in.')
  const data = await response.json()
  return data.csrf_token
}

export default function Login() {
  const navigate = useNavigate()
  const setLogin = useAuthStore((state) => state.login)
  const [step, setStep] = useState<LoginStep>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const checkSession = async () => {
      try {
        const setupResponse = await fetch('/auth/check-setup', { credentials: 'include' })
        const setup = await setupResponse.json()
        if (setup.needs_setup) {
          navigate('/setup', { replace: true })
          return
        }

        const response = await fetch('/auth/session-status', { credentials: 'include' })
        if (!response.ok) return
        const session = await response.json()
        if (session.logged_in && session.broker) {
          navigate('/dashboard', { replace: true })
        } else if (session.authenticated) {
          navigate('/broker', { replace: true })
        }
      } catch {
        setError('Unable to check the current session. You can still try signing in.')
      } finally {
        setChecking(false)
      }
    }
    checkSession()
  }, [navigate])

  const finishLogin = (result: LoginResult) => {
    const broker = result.broker || ''
    setLogin(username, broker)
    showToast.success('Signed in successfully', 'system')
    window.location.assign(result.redirect || (broker ? '/dashboard' : '/broker'))
  }

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const form = new FormData()
      form.append('username', username.trim())
      form.append('password', password)
      form.append('csrf_token', await csrfToken())
      const response = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const result: LoginResult = await response.json()
      if (!response.ok || result.status === 'error') {
        setError(result.message || 'Sign-in failed.')
      } else if (result.status === 'totp_required') {
        setStep('totp')
        setTotpCode('')
      } else {
        finishLogin(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitTotp = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/auth/login/totp', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': await csrfToken(),
        },
        body: JSON.stringify({ totp_code: totpCode }),
      })
      const result: LoginResult = await response.json()
      if (!response.ok || result.status === 'error') {
        setError(result.message || 'The authentication code is invalid.')
        if (response.status === 401 && result.message?.toLowerCase().includes('expired')) {
          setStep('password')
        }
        setTotpCode('')
      } else {
        finishLogin(result)
      }
    } catch {
      setError('Code verification failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <img src="/logo.png" alt="OpenAlgo" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-3xl font-bold">OpenAlgo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to manage your trading system
          </p>
        </div>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>{step === 'password' ? 'Sign in' : 'Verify identity'}</CardTitle>
            <CardDescription>
              {step === 'password'
                ? 'Use the account created during initial setup.'
                : 'Enter the current code from your authenticator app.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'password' ? (
              <form onSubmit={submitPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      className="pr-11"
                      required
                      disabled={submitting}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : <LogIn />}
                  {submitting ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>
            ) : (
              <form onSubmit={submitTotp} className="space-y-4">
                <Alert>
                  <ShieldCheck />
                  <AlertTitle>Two-factor authentication</AlertTitle>
                  <AlertDescription>This extra check protects the trading account.</AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="totp-code">Authentication code</Label>
                  <Input
                    id="totp-code"
                    value={totpCode}
                    onChange={(event) =>
                      setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="text-center font-mono text-lg"
                    autoFocus
                    required
                    disabled={submitting}
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStep('password')
                      setError('')
                    }}
                    disabled={submitting}
                  >
                    <ArrowLeft />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={submitting || totpCode.length !== 6}
                  >
                    {submitting && <Loader2 className="animate-spin" />}
                    Verify
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
