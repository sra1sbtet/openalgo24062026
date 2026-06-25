import { Check, KeyRound, Loader2, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { authApi } from '@/api/auth'
import { webClient } from '@/api/client'
import TwoFactorEnforcement from '@/components/auth/TwoFactorEnforcement'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { showToast } from '@/utils/toast'

interface ProfileData {
  username: string
  email: string
  qr_code: string
}

const passwordRules = [
  { label: '8 or more characters', test: (value: string) => value.length >= 8 },
  { label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'One number', test: (value: string) => /\d/.test(value) },
  { label: 'One special character', test: (value: string) => /[!@#$%^&*]/.test(value) },
]

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    webClient
      .get<ProfileData>('/auth/profile')
      .then((response) => setProfile(response.data))
      .catch(() => setError('Unable to load account information.'))
      .finally(() => setLoading(false))
  }, [])

  const rulesMet = passwordRules.every((rule) => rule.test(newPassword))
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!rulesMet || !passwordsMatch) return
    setSaving(true)
    setError('')
    try {
      await authApi.changePassword(currentPassword, newPassword, confirmPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showToast.success('Password changed successfully', 'system')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Password change failed.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the security of this OpenAlgo installation.
        </p>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="account">
            <UserRound />
            Account
          </TabsTrigger>
          <TabsTrigger value="two-factor">
            <ShieldCheck />
            Two-factor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4 space-y-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>The administrator account for this installation.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={profile?.username || ''} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email || ''} readOnly />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Change password
              </CardTitle>
              <CardDescription>Use a strong password that is unique to OpenAlgo.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {passwordRules.map((rule) => {
                    const met = rule.test(newPassword)
                    return (
                      <div
                        key={rule.label}
                        className={met ? 'flex items-center gap-2 text-green-600' : 'flex items-center gap-2 text-muted-foreground'}
                      >
                        <Check className={met ? 'opacity-100' : 'opacity-25'} />
                        {rule.label}
                      </div>
                    )
                  })}
                </div>
                {confirmPassword && !passwordsMatch && (
                  <Alert variant="destructive">
                    <AlertDescription>New passwords do not match.</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  disabled={saving || !currentPassword || !rulesMet || !passwordsMatch}
                >
                  {saving && <Loader2 className="animate-spin" />}
                  Change password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="two-factor" className="mt-4 space-y-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Authenticator setup</CardTitle>
              <CardDescription>
                Scan this QR code before enabling two-factor sign-in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile?.qr_code ? (
                <img
                  src={`data:image/png;base64,${profile.qr_code}`}
                  alt="Authenticator setup QR code"
                  className="h-52 w-52 border bg-white p-2"
                />
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>Authenticator setup code is unavailable.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          <TwoFactorEnforcement />
        </TabsContent>
      </Tabs>
    </div>
  )
}
