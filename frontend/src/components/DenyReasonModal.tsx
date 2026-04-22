import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Spinner,
  Textarea,
} from '@fluentui/react-components'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

export function DenyReasonModal({ open, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (reason.trim().length < 5) {
      setError('Please provide a reason (min 5 characters).')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(reason)
      setReason('')
      setError('')
      onClose()
    } catch {
      setError('Failed to deny request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Deny Request</DialogTitle>
          <DialogContent>
            <Field label="Reason for denial" required>
              <Textarea
                rows={3}
                value={reason}
                onChange={(_, d) => setReason(d.value)}
                placeholder="Explain why this request is denied..."
              />
            </Field>
            {error && <span style={{ color: 'red', fontSize: 13 }}>{error}</span>}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={handleConfirm} disabled={submitting}>
              {submitting ? <Spinner size="tiny" /> : 'Deny'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
