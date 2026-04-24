import { useState, useEffect } from 'react'
import {
  listInstances, createRequest, listAllRequests,
  approveRequestWithOTP, denyRequest, getRebootHistory,
  getTOTPSetup, verifyTOTPSetup, resetTOTP,
} from '../lib/api'
import type { CurrentUser, EC2Instance, OperationType, RestartRequest } from '../types'
import { QRCodeSVG } from 'qrcode.react'
import {
  Server24Regular, Clipboard24Regular, WeatherPartlyCloudyDay24Regular,
  Flash24Regular, Document24Regular, CheckmarkCircle24Regular,
  DismissCircle24Regular, LockClosed24Regular, ShieldKeyhole24Regular,
  MailInbox24Regular, ArrowClockwise20Regular, Navigation24Regular,
  Power24Regular, Play24Regular,
} from '@fluentui/react-icons'

interface Props {
  user: CurrentUser
  view: 'ec2' | 'requests'
  onToggleSidebar?: () => void
}

export function AdminDashboard({ user, view, onToggleSidebar }: Props) {
  const [instances, setInstances] = useState<EC2Instance[]>([])
  const [requests, setRequests] = useState<RestartRequest[]>([])
  const [ec2Filter, setEc2Filter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [reqFilter, setReqFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const [totpEnabled, setTotpEnabled] = useState(user.totpEnabled ?? false)
  const [totpSetupData, setTotpSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null)

  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [approveTarget, setApproveTarget] = useState<RestartRequest | null>(null)
  const [denyModalOpen, setDenyModalOpen] = useState(false)
  const [denyTarget, setDenyTarget] = useState<string | null>(null)
  const [logsModalOpen, setLogsModalOpen] = useState(false)
  const [logsTarget, setLogsTarget] = useState<{ id: string; name: string } | null>(null)
  const [rebootLogs, setRebootLogs] = useState<RestartRequest[]>([])

  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState('')
  const [denyInput, setDenyInput] = useState('')
  const [successToast, setSuccessToast] = useState<string | null>(null)

  // TOTP countdown timer
  const [totpSecondsLeft, setTotpSecondsLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))
  useEffect(() => {
    const id = setInterval(() => setTotpSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30)), 1000)
    return () => clearInterval(id)
  }, [])

  // Sync real totpEnabled from backend on mount
  useEffect(() => {
    getTOTPSetup().catch((e: any) => {
      if (e?.response?.status === 409) setTotpEnabled(true)
    })
  }, [])

  useEffect(() => {
    if (view === 'ec2') fetchInstances()
    if (view === 'requests') fetchRequests()
  }, [view])

  const fetchInstances = async () => {
    setLoading(true)
    try { setInstances(await listInstances()) } catch (e) { console.error(e) }
    setLoading(false)
  }

  const fetchRequests = async () => {
    setLoading(true)
    try { setRequests(await listAllRequests()) } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleOpenSetup = async () => {
    try {
      const data = await getTOTPSetup()
      setTotpSetupData(data)
      setOtpInput('')
      setSetupModalOpen(true)
    } catch (e: any) {
      if (e?.response?.status === 409) { setTotpEnabled(true); return }
      alert('Failed to get 2FA setup info')
    }
  }

  const handleRelinkTOTP = async () => {
    if (!confirm('This will remove your current 2FA link. You will need to re-scan with your authenticator app. Continue?')) return
    try {
      await resetTOTP()
      setTotpEnabled(false)
      setTotpSetupData(null)
      const data = await getTOTPSetup()
      setTotpSetupData(data)
      setOtpInput('')
      setSetupModalOpen(true)
    } catch {
      alert('Failed to reset 2FA')
    }
  }

  const handleSetupOtpChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6)
    setOtpInput(digits)
    if (digits.length === 6) {
      verifyTOTPSetup(digits)
        .then(() => { setTotpEnabled(true); setSetupModalOpen(false) })
        .catch(() => { alert('Invalid code, try again'); setOtpInput('') })
    }
  }

  const openApprove = (req: RestartRequest) => {
    if (!totpEnabled) { handleOpenSetup(); return }
    setApproveTarget(req)
    setOtpInput('')
    setOtpError('')
    setOtpModalOpen(true)
  }

  const submitApprove = async (code: string) => {
    if (!approveTarget || code.length !== 6) return
    try {
      await approveRequestWithOTP(approveTarget.requestId, code)
      setOtpModalOpen(false)
      const op = approveTarget.operation || 'reboot'
      const opLabel = op.charAt(0).toUpperCase() + op.slice(1)
      setSuccessToast(`${opLabel} command sent to ${approveTarget.instanceName}`)
      setTimeout(() => setSuccessToast(null), 4000)
      fetchRequests()
    } catch {
      setOtpError('Invalid code — try the next one')
      setOtpInput('')
    }
  }

  const handleApproveOtpChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6)
    setOtpInput(digits)
    setOtpError('')
    if (digits.length === 6) submitApprove(digits)
  }

  const openDeny = (reqId: string) => {
    setDenyTarget(reqId)
    setDenyInput('')
    setDenyModalOpen(true)
  }

  const submitDeny = async () => {
    if (!denyTarget) return
    try { await denyRequest(denyTarget, denyInput); setDenyModalOpen(false); fetchRequests() }
    catch { alert('Deny failed') }
  }

  const openLogs = async (instId: string, instName: string) => {
    setLogsTarget({ id: instId, name: instName })
    setRebootLogs([])
    setLogsModalOpen(true)
    try { setRebootLogs(await getRebootHistory(instId)) } catch { /* ignore */ }
  }

  const handleRequestOperation = async (inst: EC2Instance, operation: OperationType) => {
    const label = operation.charAt(0).toUpperCase() + operation.slice(1)
    const reason = window.prompt(`Submit ${label} request for ${inst.name}?\nReason:`)
    if (!reason) return
    try {
      await createRequest({ instanceId: inst.instanceId, instanceName: inst.name, reason, region: inst.region, operation, project: inst.project, accountId: inst.accountId })
      alert(`${label} request submitted`)
    } catch (e: any) { alert('Failed: ' + (e?.response?.data?.error || e.message)) }
  }

  const timerColor = totpSecondsLeft <= 5 ? '#ef5350' : totpSecondsLeft <= 10 ? '#f5a623' : '#50c878'

  const toast = successToast && (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: '#1e7e34', color: '#fff', borderRadius: 8,
      padding: '12px 20px', fontSize: 14, fontWeight: 500,
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <CheckmarkCircle24Regular fontSize={18} />
      {successToast}
    </div>
  )

  const totpWarning = (
    <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      {!totpEnabled
        ? <><ShieldKeyhole24Regular fontSize={16} style={{ color: 'var(--status-pending)' }} />
            <span style={{ color: 'var(--status-pending)' }}>2FA not set up</span>
            <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={handleOpenSetup}>Setup 2FA</button>
          </>
        : <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12, color: 'var(--text-muted)' }} onClick={handleRelinkTOTP}>
            <ShieldKeyhole24Regular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Re-link 2FA
          </button>
      }
    </div>
  )

  // ── Modals ────────────────────────────────────────────────────────────────────

  const modals = (
    <>
      {setupModalOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-icon"><ShieldKeyhole24Regular style={{ fontSize: 28 }} /></span>
              <div><h2>Setup 2FA</h2><p className="modal-subtitle">Scan with Google / Microsoft Authenticator</p></div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              {totpSetupData && (
                <div style={{ background: '#fff', padding: 16, display: 'inline-block', borderRadius: 8, marginBottom: 16 }}>
                  <QRCodeSVG value={totpSetupData.otpauthUrl} size={160} />
                </div>
              )}
              <input
                autoFocus type="text" inputMode="numeric"
                className="sudo-input txt-input"
                placeholder="Enter 6-digit code to confirm"
                style={{ textAlign: 'center', letterSpacing: 8, fontSize: 22 }}
                value={otpInput}
                onChange={e => handleSetupOtpChange(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setSetupModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => {
                verifyTOTPSetup(otpInput)
                  .then(() => { setTotpEnabled(true); setSetupModalOpen(false) })
                  .catch(() => alert('Invalid code'))
              }}>Verify</button>
            </div>
          </div>
        </div>
      )}

      {otpModalOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-icon"><LockClosed24Regular style={{ fontSize: 28 }} /></span>
              <div>
                <h2>Confirm Approval</h2>
                <p className="modal-subtitle">
                  <span className={`op-badge op-${approveTarget?.operation || 'reboot'}`}>{approveTarget?.operation || 'reboot'}</span>
                  {' '}<strong>{approveTarget?.instanceName}</strong>
                </p>
              </div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
                <svg width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border-light)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke={timerColor} strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 15}`}
                    strokeDashoffset={`${2 * Math.PI * 15 * (1 - totpSecondsLeft / 30)}`}
                    strokeLinecap="round"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s' }}
                  />
                  <text x="18" y="23" textAnchor="middle" fontSize="11" fill={timerColor} fontWeight="700">{totpSecondsLeft}</text>
                </svg>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {totpSecondsLeft <= 5 ? 'Code expiring — wait for next' : 'Open Authenticator app'}
                </span>
              </div>
              <input
                autoFocus type="text" inputMode="numeric"
                className="sudo-input txt-input"
                placeholder="• • • • • •"
                style={{ textAlign: 'center', letterSpacing: 12, fontSize: 32, width: '100%' }}
                value={otpInput}
                onChange={e => handleApproveOtpChange(e.target.value)}
              />
              {otpError && <div style={{ color: '#ef5350', fontSize: 12, marginTop: 8 }}>{otpError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setOtpModalOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={otpInput.length !== 6} onClick={() => submitApprove(otpInput)}>
                Verify & Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {denyModalOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-icon"><DismissCircle24Regular style={{ fontSize: 28, color: 'var(--status-stopped)' }} /></span>
              <div><h2>Deny Request</h2></div>
            </div>
            <div className="modal-body">
              <label className="input-label">Reason (optional):</label>
              <input autoFocus type="text" className="sudo-input txt-input" value={denyInput}
                onChange={e => setDenyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitDeny()} />
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setDenyModalOpen(false)}>Cancel</button>
              <button className="btn-danger" onClick={submitDeny}>Deny</button>
            </div>
          </div>
        </div>
      )}

      {logsModalOpen && (
        <div className="modal">
          <div className="modal-card" style={{ width: 620 }}>
            <div className="modal-header">
              <span className="modal-icon"><Document24Regular style={{ fontSize: 28 }} /></span>
              <div><h2>Reboot History</h2><p className="modal-subtitle">{logsTarget?.name} ({logsTarget?.id})</p></div>
            </div>
            <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {rebootLogs.length === 0
                ? <p style={{ color: 'var(--text-muted)' }}>No reboot records found.</p>
                : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {rebootLogs.map(r => (
                      <li key={r.requestId} style={{ borderBottom: '1px solid var(--border-light)', padding: '12px 4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>
                            <CheckmarkCircle24Regular fontSize={13} style={{ color: 'var(--status-running)', marginRight: 5, verticalAlign: 'middle' }} />
                            Rebooted
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {new Date(r.updatedAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span><span style={{ color: 'var(--text-muted)' }}>Requested by:</span> <strong>{r.userName}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)' }}>Approved by:</span> <strong>{r.approvedByName || r.approvedBy || '—'}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)' }}>Reason:</span> {r.reason}</span>
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11, marginTop: 2 }}>{r.requestId}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
              }
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setLogsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  // ── EC2 View ──────────────────────────────────────────────────────────────────

  if (view === 'ec2') {
    const projects = [...new Set(instances.map(i => i.project).filter(Boolean))] as string[]
    const filtered = instances
      .filter(i => ec2Filter === 'all' || i.state === ec2Filter)
      .filter(i => projectFilter === 'all' || i.project === projectFilter)
    return (
      <div className="view-section active">
        <header className="top-nav">
          <div className="top-nav-left">
            <button className="mobile-menu-btn" onClick={onToggleSidebar}>
              <Navigation24Regular />
            </button>
            <button className="btn-top-nav"><span className="icon" style={{ display: 'flex' }}><Server24Regular fontSize={18} /></span> EC2 List</button>
          </div>
          <div className="top-nav-right">
            {totpWarning}
          </div>
        </header>
        <div className="content-scroll">
          <div className="hero-banner">
            <div className="hero-left">
              <div className="date-block"><div id="date-num">{new Date().getDate()}</div></div>
              <div className="hero-icon"><WeatherPartlyCloudyDay24Regular style={{ fontSize: 42 }} /></div>
              <div className="greeting-block"><h1>Admin EC2 Panel</h1><p>Manage restartable instances</p></div>
            </div>
            <div className="hero-right">
              <div className="hero-status-text">{instances.length} total, {instances.filter(i => i.state === 'running').length} running</div>
              <button className="btn-ghost" onClick={fetchInstances} disabled={loading}>
                {loading ? 'Scanning...' : <><ArrowClockwise20Regular style={{ marginRight: 6, verticalAlign: 'middle' }} />Scan</>}
              </button>
            </div>
          </div>
          <div className="filter-tabs">
            {['all', 'running', 'stopped'].map(f => (
              <button key={f} className={`tab ${ec2Filter === f ? 'active' : ''}`} onClick={() => setEc2Filter(f)}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          {projects.length > 0 && (
            <div className="filter-tabs" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', marginRight: 4 }}>Project:</span>
              {['all', ...projects].map(p => (
                <button key={p} className={`tab ${projectFilter === p ? 'active' : ''}`} onClick={() => setProjectFilter(p)}>
                  {p === 'all' ? 'All' : p}
                </button>
              ))}
            </div>
          )}
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Server Name</th><th>Instance ID</th><th>Region</th><th>Project</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(inst => (
                  <tr key={inst.instanceId} className="instance-row">
                    <td className="name-cell"><span className="server-icon" style={{ verticalAlign: 'middle', display: 'inline-block' }}><Server24Regular fontSize={16} /></span>{inst.name}</td>
                    <td className="id-cell">{inst.instanceId}</td>
                    <td className="id-cell" style={{ fontSize: 12 }}>{inst.region}</td>
                    <td className="id-cell" style={{ fontSize: 12, color: inst.project ? 'inherit' : 'var(--text-muted)' }}>{inst.project || '—'}</td>
                    <td><div className="status-badge"><span className={`status-dot dot-${inst.state === 'running' ? 'running' : 'stopped'}`} />{inst.state}</div></td>
                    <td className="action-cell">
                      {inst.state === 'running' ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn-action btn-danger-outline" onClick={() => handleRequestOperation(inst, 'reboot')}><Flash24Regular fontSize={14} style={{ marginRight: 4 }} />Reboot</button>
                          <button className="btn-action btn-action-danger" onClick={() => handleRequestOperation(inst, 'stop')}><Power24Regular fontSize={14} style={{ marginRight: 4 }} />Stop</button>
                        </div>
                      ) : inst.state === 'stopped' ? (
                        <button className="btn-action btn-action-success" onClick={() => handleRequestOperation(inst, 'start')}><Play24Regular fontSize={14} style={{ marginRight: 4 }} />Start</button>
                      ) : <span className="no-action">—</span>}
                      <button className="btn-icon-action" title="Operation History" onClick={() => openLogs(inst.instanceId, inst.name)}><Document24Regular fontSize={16} /></button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No instances found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {modals}
        {toast}
      </div>
    )
  }

  // ── Requests View ─────────────────────────────────────────────────────────────

  const filteredReqs = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)
  return (
    <div className="view-section active">
      <header className="top-nav">
        <div className="top-nav-left">
          <button className="mobile-menu-btn" onClick={onToggleSidebar}>
            <Navigation24Regular />
          </button>
          <button className="btn-top-nav"><span className="icon" style={{ display: 'flex' }}><Clipboard24Regular fontSize={18} /></span> Global Request Queue</button>
        </div>
        <div className="top-nav-right">
          {totpWarning}
        </div>
      </header>
      <div className="content-scroll">
        <div className="hero-banner req-banner">
          <div className="hero-left">
            <div className="date-block highlight-badge"><div className="date-num lg-num">{requests.filter(r => r.status === 'pending').length}</div></div>
            <div className="hero-icon"><MailInbox24Regular style={{ fontSize: 42 }} /></div>
            <div className="greeting-block"><h1>Approval Queue</h1><p>Approve or deny infrastructure actions</p></div>
          </div>
          <div className="hero-right">
            <button className="btn-ghost" onClick={fetchRequests} disabled={loading}>🔄 Refresh</button>
          </div>
        </div>
        <div className="filter-tabs">
          {['all', 'pending', 'approved', 'denied'].map(f => (
            <button key={f} className={`tab ${reqFilter === f ? 'active' : ''}`} onClick={() => setReqFilter(f)}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Requester</th><th>Target</th><th>Operation</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredReqs.map(req => (
                <tr key={req.requestId} className={`instance-row ${req.status === 'pending' ? 'row-pending' : ''}`}>
                  <td className="name-cell">{req.userName}</td>
                  <td><span className="server-icon" style={{ verticalAlign: 'middle', display: 'inline-block' }}><Server24Regular fontSize={16} /></span>{req.instanceName}</td>
                  <td><span className={`op-badge op-${req.operation || 'reboot'}`}>{req.operation || 'reboot'}</span></td>
                  <td className="id-cell">{new Date(req.createdAt).toLocaleString()}</td>
                  <td><div className="status-badge"><span className={`status-dot dot-${req.status === 'approved' ? 'running' : req.status === 'denied' ? 'stopped' : 'pending'}`} />{req.status}</div></td>
                  <td className="action-cell">
                    {req.status === 'pending' ? (
                      <>
                        <button className="btn-action" style={{ color: 'var(--status-running)', borderColor: 'rgba(108,193,123,0.3)' }} onClick={() => openApprove(req)}>
                          <CheckmarkCircle24Regular fontSize={14} style={{ marginRight: 4 }} />Approve
                        </button>
                        <button className="btn-icon-action" style={{ color: 'var(--status-stopped)', borderColor: 'rgba(224,108,108,0.3)' }} onClick={() => openDeny(req.requestId)}>
                          <DismissCircle24Regular fontSize={16} />
                        </button>
                      </>
                    ) : req.status === 'denied' && req.denyReason
                      ? <span className="deny-reason">{req.denyReason}</span>
                      : <span className="no-action">—</span>}
                  </td>
                </tr>
              ))}
              {filteredReqs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No requests found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {modals}
      {toast}
    </div>
  )
}
