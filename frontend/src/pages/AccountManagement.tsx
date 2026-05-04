import { useState, useEffect } from 'react'
import { ArrowClockwise20Regular } from '@fluentui/react-icons'
import { listAccounts, createAccount, deleteAccount, generateExternalId } from '../lib/api'
import type { AWSAccount } from '../types'
import {
  Navigation24Regular, Cloud24Regular, Add24Regular, Delete24Regular,
  Copy24Regular, Key24Regular,
} from '@fluentui/react-icons'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'

interface Props {
  onToggleSidebar?: () => void
}

interface AccountForm {
  accountId: string
  alias: string
  roleArn: string
  externalId: string
  regions: string
  project: string
}

const emptyForm = (): AccountForm => ({
  accountId: '',
  alias: '',
  roleArn: '',
  externalId: '',
  regions: 'us-west-2',
  project: '',
})

export function AccountManagement({ onToggleSidebar }: Props) {
  const [accounts, setAccounts] = useState<AWSAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [form, setForm] = useState<AccountForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AWSAccount | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'error') => setToast({ message, type })

  const fetchAccounts = async () => {
    setLoading(true)
    try { setAccounts(await listAccounts()) } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchAccounts() }, [])

  const openAdd = async () => {
    const f = emptyForm()
    try {
      const { externalId } = await generateExternalId()
      f.externalId = externalId
    } catch { /* ignore */ }
    setForm(f)
    setAddModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await createAccount({
        accountId: form.accountId.trim(),
        alias: form.alias.trim(),
        roleArn: form.roleArn.trim(),
        externalId: form.externalId.trim(),
        regions: form.regions.split(',').map(r => r.trim()).filter(Boolean),
        project: form.project.trim(),
      })
      setAddModalOpen(false)
      await fetchAccounts()
    } catch (e: any) {
      showToast('Failed: ' + (e?.response?.data?.error || e.message))
    }
    setSaving(false)
  }

  const confirmDeleteAccount = async () => {
    if (!confirmDelete) return
    try { await deleteAccount(confirmDelete.accountId); await fetchAccounts(); showToast('Account removed', 'success') }
    catch { showToast('Delete failed') }
    setConfirmDelete(null)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="view-section active">
      <header className="top-nav">
        <div className="top-nav-left">
          <button className="mobile-menu-btn" onClick={onToggleSidebar}><Navigation24Regular /></button>
          <button className="btn-top-nav">
            <span className="icon" style={{ display: 'flex' }}><Cloud24Regular fontSize={18} /></span>
            AWS Accounts
          </button>
        </div>
        <div className="top-nav-right">
          <button className="btn-ghost" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Add24Regular fontSize={16} /> Add Account
          </button>
        </div>
      </header>

      <div className="content-scroll">
        <div className="hero-banner">
          <div className="hero-left">
            <div className="date-block highlight-badge">
              <div className="date-num lg-num">{accounts.length}</div>
            </div>
            <div className="hero-icon"><Cloud24Regular style={{ fontSize: 42 }} /></div>
            <div className="greeting-block">
              <h1>AWS Accounts</h1>
              <p>Hub-and-Spoke AssumeRole — manage cross-account access</p>
            </div>
          </div>
          <div className="hero-right">
            <button className="btn-ghost" onClick={fetchAccounts} disabled={loading}>
              {loading ? 'Loading...' : <><ArrowClockwise20Regular style={{ marginRight: 6, verticalAlign: 'middle' }} />Refresh</>}
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Role ARN</th>
                <th>Regions</th>
                <th>Project tag</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => (
                <tr key={acc.accountId} className="instance-row">
                  <td className="name-cell">
                    <div style={{ fontWeight: 600 }}>{acc.alias}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{acc.accountId}</div>
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.roleArn}
                  </td>
                  <td className="id-cell">{acc.regions?.join(', ')}</td>
                  <td className="id-cell" style={{ color: acc.project ? 'inherit' : 'var(--text-muted)' }}>{acc.project || '—'}</td>
                  <td className="action-cell">
                    <button className="btn-icon-action" title="Delete account" style={{ color: 'var(--status-stopped)' }} onClick={() => setConfirmDelete(acc)}>
                      <Delete24Regular fontSize={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No accounts added yet
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addModalOpen && (
        <div className="modal">
          <div className="modal-card" style={{ width: 560 }}>
            <div className="modal-header">
              <span className="modal-icon"><Cloud24Regular style={{ fontSize: 28 }} /></span>
              <div><h2>Add AWS Account</h2><p className="modal-subtitle">Configure AssumeRole access to a spoke account</p></div>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="input-label">AWS Account ID *</label>
                  <input className="txt-input" value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} placeholder="123456789012" />
                </div>
                <div>
                  <label className="input-label">Alias *</label>
                  <input className="txt-input" value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} placeholder="Production - Customer A" />
                </div>
              </div>
              <div>
                <label className="input-label">
                  Role ARN
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(để trống nếu đây là hub account)</span>
                </label>
                <input className="txt-input" value={form.roleArn} onChange={e => setForm(f => ({ ...f, roleArn: e.target.value }))} placeholder="arn:aws:iam::123456789012:role/TeamAWSExtension-ExecutionRole" />
              </div>
              {form.roleArn && (
                <div>
                  <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Key24Regular fontSize={14} /> External ID
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(auto-generated)</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="txt-input" value={form.externalId} onChange={e => setForm(f => ({ ...f, externalId: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: 13 }} />
                    <button className="btn-ghost" style={{ whiteSpace: 'nowrap', padding: '6px 12px' }} onClick={() => copyToClipboard(form.externalId)}>
                      <Copy24Regular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Paste this UUID into the <code>sts:ExternalId</code> condition of the IAM trust policy in the target account.
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="input-label">Regions * (comma-separated)</label>
                  <input className="txt-input" value={form.regions} onChange={e => setForm(f => ({ ...f, regions: e.target.value }))} placeholder="us-west-2, ap-southeast-1" />
                </div>
                <div>
                  <label className="input-label">Project tag</label>
                  <input className="txt-input" value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} placeholder="CustomerA" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setAddModalOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving || !form.accountId || !form.alias} onClick={handleSave}>
                {saving ? 'Saving...' : 'Add Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Remove account"
          message={`Remove "${confirmDelete.alias}" (${confirmDelete.accountId})?\nThis will not affect existing projects.`}
          confirmLabel="Remove"
          danger
          onConfirm={confirmDeleteAccount}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
