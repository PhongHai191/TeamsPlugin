import { useState } from 'react'
import type { EC2Instance, OperationType } from '../types'

interface Props {
  inst: EC2Instance
  operation: OperationType
  onSubmit: (inst: EC2Instance, operation: OperationType, reason: string) => void
  onCancel: () => void
}

const LABEL: Record<OperationType, string> = { reboot: 'Reboot', stop: 'Stop', start: 'Start' }
const COLOR: Record<OperationType, string> = { reboot: 'btn-danger-outline', stop: 'btn-danger', start: 'btn-primary' }

export function OperationRequestModal({ inst, operation, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('')
  const label = LABEL[operation]

  const handleSubmit = () => {
    if (!reason.trim()) return
    onSubmit(inst, operation, reason.trim())
  }

  return (
    <div className="modal" onClick={onCancel}>
      <div className="modal-card" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Submit {label} request</h2>
            <p className="modal-subtitle" style={{ marginTop: 4 }}>{inst.name} · {inst.instanceId}</p>
          </div>
        </div>
        <div className="modal-body">
          <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Reason *</label>
          <textarea
            className="txt-input"
            style={{ width: '100%', minHeight: 80, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            placeholder="Describe why this operation is needed..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSubmit() }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={COLOR[operation]} disabled={!reason.trim()} onClick={handleSubmit}>
            Submit {label}
          </button>
        </div>
      </div>
    </div>
  )
}
