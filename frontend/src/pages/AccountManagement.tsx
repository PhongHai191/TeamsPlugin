import { useState, useEffect } from 'react'
import { ArrowClockwise20Regular, ChevronDown20Regular, ChevronRight20Regular } from '@fluentui/react-icons'
import { listAccounts, createAccount, deleteAccount, generateExternalId, listAllProjects } from '../lib/api'
import type { AWSAccount, Project } from '../types'
import {
  Navigation24Regular, Cloud24Regular, Add24Regular, Delete24Regular,
  Copy24Regular, Key24Regular, FolderOpen20Regular, ArrowRight20Regular,
} from '@fluentui/react-icons'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'

interface Props {
  onToggleSidebar?: () => void
  onNavigateToProject?: (projectId: string) => void
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

export function AccountManagement({ onToggleSidebar, onNavigateToProject }: Props) {
  const [accounts, setAccounts] = useState<AWSAccount[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [form, setForm] = useState<AccountForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AWSAccount | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'error') => setToast({ message, type })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [accs, projs] = await Promise.all([listAccounts(), listAllProjects().catch(() => [])])
      setAccounts(accs)
      setProjects(projs)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

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
      await fetchData()
    } catch (e: any) {
      showToast('Failed: ' + (e?.response?.data?.error || e.message))
    }
    setSaving(false)
  }

  const confirmDeleteAccount = async () => {
    if (!confirmDelete) return
    try { await deleteAccount(confirmDelete.accountId); await fetchData(); showToast('Account removed', 'success') }
    catch { showToast('Delete failed') }
    setConfirmDelete(null)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleExpand = (accountId: string) => {
    setExpandedAccountId(prev => prev === accountId ? null : accountId)
  }

  const projectsForAccount = (accountId: string) => projects.filter(p => p.accountId === accountId)

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
            <button className="btn-ghost" onClick={fetchData} disabled={loading}>
              {loading ? 'Loading...' : <><ArrowClockwise20Regular style={{ marginRight: 6, verticalAlign: 'middle' }} />Refresh</>}
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '34%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Account</th>
                <th>Role ARN</th>
                <th>Regions</th>
                <th>Projects</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => {
                const accProjects = projectsForAccount(acc.accountId)
                const isExpanded = expandedAccountId === acc.accountId
                return (
                  <>
                    <tr
                      key={acc.accountId}
                      className="instance-row"
                      style={{ cursor: accProjects.length > 0 ? 'pointer' : 'default' }}
                      onClick={() => accProjects.length > 0 && toggleExpand(acc.accountId)}
                    >
                      <td style={{ color: 'var(--text-muted)', paddingLeft: 12 }}>
                        {accProjects.length > 0
                          ? (isExpanded ? <ChevronDown20Regular /> : <ChevronRight20Regular />)
                          : null
                        }
                      </td>
                      <td className="name-cell">
                        <div style={{ fontWeight: 600 }}>{acc.alias}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{acc.accountId}</div>
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: acc.roleArn ? 'inherit' : 'var(--text-muted)' }}>
                        {acc.roleArn || 'hub (native creds)'}
                      </td>
                      <td className="id-cell">{acc.regions?.join(', ')}</td>
                      <td className="id-cell" style={{ color: accProjects.length > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {accProjects.length > 0 ? `${accProjects.length} project${accProjects.length > 1 ? 's' : ''}` : '—'}
                      </td>
                      <td className="action-cell" onClick={e => e.stopPropagation()}>
                        <button className="btn-icon-action" title="Delete account" style={{ color: 'var(--status-stopped)' }} onClick={() => setConfirmDelete(acc)}>
                          <Delete24Regular fontSize={16} />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && accProjects.map(proj => (
                      <tr
                        key={proj.projectId}
                        className="instance-row"
                        style={{ background: 'var(--bg-secondary)', cursor: 'pointer' }}
                        onClick={() => onNavigateToProject?.(proj.projectId)}
                      >
                        <td></td>
                        <td colSpan={4} style={{ paddingLeft: 32, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FolderOpen20Regular style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{proj.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{proj.instanceIds?.length ?? 0} instances · {proj.memberCount ?? 0} members</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)' }}>
                            Open <ArrowRight20Regular fontSize={14} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })}
              {accounts.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
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
