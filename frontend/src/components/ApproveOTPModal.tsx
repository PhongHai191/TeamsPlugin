import {
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
} from '@fluentui/react-components'
import { useState } from 'react'
import { approveRequestWithOTP } from '../lib/api'

interface Props {
  open: boolean
  requestId: string
  instanceName: string
  onClose: () => void
  onApproved: () => void
}

export function ApproveOTPModal({ open, requestId, instanceName, onClose, onApproved }: Props) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleApprove = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return }
    setSubmitting(true)
    setError('')
    try {
      await approveRequestWithOTP(requestId, code)
      setCode('')
      onApproved()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to approve. Check your code and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setCode('')
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && handleClose()}>
      <DialogSurface style={{ maxWidth: 380 }}>
        <DialogBody>
          <DialogTitle>Confirm Restart — {instanceName}</DialogTitle>
          <DialogContent>
            <Text style={{ display: 'block', marginBottom: 16 }}>
              Enter the 6-digit code from your authenticator app to approve this restart.
            </Text>
            <Field label="Authenticator code" required>
              <Input
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(_, d) => setCode(d.value.replace(/\D/g, ''))}
                style={{ letterSpacing: '6px', fontSize: '22px', textAlign: 'center' }}
                autoFocus
              />
            </Field>
            {error && <Text style={{ color: 'red', fontSize: 13, marginTop: 8, display: 'block' }}>{error}</Text>}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={handleClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleApprove} disabled={submitting || code.length !== 6}>
              {submitting ? <Spinner size="tiny" /> : 'Approve & Restart'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
