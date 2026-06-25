import { Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { webClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { showToast } from '@/utils/toast'

interface TwoFactorStatus {
  totp_enabled: boolean
  totp_required_for_login: boolean
  last_totp_verified_at: string | null
}

export default function TwoFactorEnforcement() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [requiredForLogin, setRequiredForLogin] = useState(false)
  const [totpCode, setTotpCode] = useState('')

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const response = await webClient.get<TwoFactorStatus>('/auth/2fa/status')
      setStatus(response.data)
      setEnabled(response.data.totp_enabled)
      setRequiredForLogin(response.data.totp_required_for_login)
    } catch {
      showToast.error('Failed to load two-factor settings', 'system')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const dirty =
    status &&
    (enabled !== status.totp_enabled || requiredForLogin !== status.totp_required_for_login)

  const setMaster = (value: boolean) => {
    setEnabled(value)
    if (!value) setRequiredForLogin(false)
  }

  const save = async () => {
    if (totpCode.length !== 6) {
      showToast.error('Enter the current 6-digit authenticator code.', 'system')
      return
    }
    setSaving(true)
    try {
      await webClient.post('/auth/2fa/configure', {
        totp_enabled: enabled,
        totp_required_for_login: requiredForLogin,
        totp_code: totpCode,
      })
      showToast.success('Two-factor settings updated', 'system')
      setTotpCode('')
      await fetchStatus()
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update two-factor settings.'
      showToast.error(message, 'system')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Two-factor sign-in
        </CardTitle>
        <CardDescription>Require an authenticator code after the account password.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 border p-4">
          <div>
            <Label className="font-semibold">Enable two-factor authentication</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              The QR code above must be added to your authenticator app first.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setMaster} />
        </div>

        {enabled && (
          <div className="flex items-start justify-between gap-4 border p-4">
            <div>
              <Label className="font-medium">Protect dashboard sign-in</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask for a 6-digit code whenever this account signs in.
              </p>
            </div>
            <Switch checked={requiredForLogin} onCheckedChange={setRequiredForLogin} />
          </div>
        )}

        {dirty && (
          <div className="space-y-3 border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
            <div className="space-y-1">
              <Label htmlFor="confirm-totp">Confirm with authenticator code</Label>
              <p className="text-xs text-muted-foreground">
                Enter the current code to save this security change.
              </p>
            </div>
            <Input
              id="confirm-totp"
              value={totpCode}
              onChange={(event) =>
                setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="max-w-xs text-center font-mono"
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || totpCode.length !== 6}>
                {saving && <Loader2 className="animate-spin" />}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEnabled(Boolean(status?.totp_enabled))
                  setRequiredForLogin(Boolean(status?.totp_required_for_login))
                  setTotpCode('')
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {status?.last_totp_verified_at && (
          <p className="text-xs text-muted-foreground">
            Last verified: {new Date(status.last_totp_verified_at).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
