import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  Field,
  Option,
  Spinner,
  Textarea,
  makeStyles,
} from '@fluentui/react-components'
import { Add20Regular } from '@fluentui/react-icons'
import { useQuery } from '../hooks/useQuery'
import { createRequest, listInstances } from '../lib/api'
import type { EC2Instance } from '../types'

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '400px' },
})

interface Props {
  onCreated: () => void
}

export function NewRequestModal({ onCreated }: Props) {
  const styles = useStyles()
  const [open, setOpen] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<EC2Instance | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { data: instances } = useQuery(listInstances, [])

  const handleSubmit = async () => {
    if (!selectedInstance) {
      setError('Please select an EC2 instance.')
      return
    }
    if (reason.trim().length < 5) {
      setError('Reason must be at least 5 characters.')
      return
    }
    setSubmitting(true)
    try {
      await createRequest({
        instanceId: selectedInstance.instanceId,
        instanceName: selectedInstance.name || selectedInstance.instanceId,
        reason,
      })
      setOpen(false)
      setSelectedInstance(null)
      setReason('')
      setError('')
      onCreated()
    } catch {
      setError('Failed to submit request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="primary" icon={<Add20Regular />}>
          New Request
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Request Server Restart</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field label="EC2 Instance" required>
                <Dropdown
                  placeholder="Select an instance"
                  onOptionSelect={(_, d) => {
                    const inst = instances?.find(i => i.instanceId === d.optionValue)
                    setSelectedInstance(inst ?? null)
                  }}
                >
                  {(instances ?? []).map(inst => (
                    <Option key={inst.instanceId} value={inst.instanceId}>
                      {inst.name || inst.instanceId} ({inst.instanceType}) — {inst.state}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Reason" required hint="Min 5 characters">
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  placeholder="Describe why you need the restart..."
                />
              </Field>
              {error && <span style={{ color: 'red', fontSize: 13 }}>{error}</span>}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button appearance="primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Spinner size="tiny" /> : 'Submit'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
