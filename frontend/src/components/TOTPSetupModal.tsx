import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { ShieldLock20Regular } from '@fluentui/react-icons'
import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getTOTPSetup, verifyTOTPSetup } from '../lib/api'

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
  qr: { padding: '12px', background: 'white', borderRadius: '8px', display: 'inline-block' },
  secret: {
    fontFamily: 'monospace',
    fontSize: '13px',
    background: tokens.colorNeutralBackground3,
    padding: '8px 12px',
    borderRadius: '4px',
    letterSpacing: '2px',
    wordBreak: 'break-all',
    textAlign: 'center',
  },
  steps: { alignSelf: 'flex-start', lineHeight: '1.8' },
})

interface Props {
  open: boolean
  onClose: () => void
  onEnabled: () => void
}

export function TOTPSetupModal({ open, onClose, onEnabled }: Props) {
  const styles = useStyles()
  const [step, setStep] = useState<'loading' | 'scan' | 'verify' | 'done'>('loading')
  const [otpauthUrl, setOtpauthUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('loading')
    setError('')
    setCode('')
    getTOTPSetup()
      .then(data => {
        setOtpauthUrl(data.otpauthUrl)
        setSecret(data.secret)
        setStep('scan')
      })
      .catch(() => {
        setError('Failed to generate QR code.')
        setStep('scan')
      })
  }, [open])

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return }
    setSubmitting(true)
    setError('')
    try {
      await verifyTOTPSetup(code)
      setStep('done')
      onEnabled()
    } catch {
      setError('Invalid code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 440 }}>
        <DialogBody>
          <DialogTitle>Set up Two-Factor Authentication</DialogTitle>
          <DialogContent>
            <div className={styles.body}>
              {step === 'loading' && (
                <>
                  <Spinner label="Generating QR code..." />
                  <Button appearance="subtle" onClick={onClose}>Cancel</Button>
                </>
              )}

              {step === 'scan' && (
                <>
                  <div className={styles.steps}>
                    <Text>1. Install <strong>Google Authenticator</strong> or <strong>Authy</strong></Text><br />
                    <Text>2. Scan the QR code below</Text><br />
                    <Text>3. Enter the 6-digit code to confirm</Text>
                  </div>
                  {otpauthUrl && (
                    <div className={styles.qr}>
                      <QRCodeSVG value={otpauthUrl} size={180} />
                    </div>
                  )}
                  <Text size={200}>Or enter manually:</Text>
                  <div className={styles.secret}>{secret}</div>
                  <Field label="Verification code" required style={{ width: '100%' }}>
                    <Input
                      placeholder="000000"
                      maxLength={6}
                      value={code}
                      onChange={(_, d) => setCode(d.value.replace(/\D/g, ''))}
                      style={{ letterSpacing: '4px', fontSize: '18px' }}
                    />
                  </Field>
                  {error && <Text style={{ color: 'red', fontSize: 13 }}>{error}</Text>}
                </>
              )}

              {step === 'done' && (
                <>
                  <Badge appearance="filled" color="success" size="extra-large">
                    2FA Enabled
                  </Badge>
                  <Text>You will now be asked for a TOTP code each time you approve a restart request.</Text>
                </>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            {step === 'scan' && (
              <>
                <Button appearance="secondary" onClick={onClose}>Cancel</Button>
                <Button appearance="primary" onClick={handleVerify} disabled={submitting}>
                  {submitting ? <Spinner size="tiny" /> : 'Verify & Enable'}
                </Button>
              </>
            )}
            {step === 'done' && (
              <Button appearance="primary" onClick={onClose}>Done</Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
