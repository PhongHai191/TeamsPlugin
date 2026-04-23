import { useState, useEffect } from 'react'
import {
  listInstances,
  createRequest,
  listAllRequests,
  approveRequestWithOTP,
  denyRequest,
  getRebootHistory,
  getTOTPSetup,
  verifyTOTPSetup
} from '../lib/api'
import type { CurrentUser, EC2Instance, RestartRequest, RebootEvent } from '../types'
import { QRCodeSVG } from 'qrcode.react'
import {
  Server24Regular,
  Clipboard24Regular,
  WeatherPartlyCloudyDay24Regular,
  Flash24Regular,
  Document24Regular,
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  LockClosed24Regular,
  ShieldKeyhole24Regular,
  MailInbox24Regular,
  ArrowClockwise20Regular
} from '@fluentui/react-icons'

interface Props {
  user: CurrentUser
  view: 'ec2' | 'requests'
}

export function AdminDashboard({ user, view }: Props) {
  const [instances, setInstances] = useState<EC2Instance[]>([])
  const [requests, setRequests] = useState<RestartRequest[]>([])
  const [ec2Filter, setEc2Filter] = useState('all')
  const [reqFilter, setReqFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const [totpEnabled, setTotpEnabled] = useState(user.totpEnabled ?? false)
  const [totpSetupData, setTotpSetupData] = useState<{ otpauthUrl: string, secret: string } | null>(null)
  
  // Modals state
  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [approveTarget, setApproveTarget] = useState<RestartRequest | null>(null)
  const [denyModalOpen, setDenyModalOpen] = useState(false)
  const [denyTarget, setDenyTarget] = useState<string | null>(null)
  const [logsModalOpen, setLogsModalOpen] = useState(false)
  const [logsTarget, setLogsTarget] = useState<{ id: string, name: string } | null>(null)
  const [rebootLogs, setRebootLogs] = useState<RebootEvent[]>([])

  const [otpInput, setOtpInput] = useState('')
  const [denyInput, setDenyInput] = useState('')

  const fetchInstances = async () => {
    setLoading(true)
    try {
      setInstances(await listInstances())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const fetchRequests = async () => {
    setLoading(true)
    try {
      setRequests(await listAllRequests())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => {
    if (view === 'ec2') fetchInstances()
    if (view === 'requests') fetchRequests()
  }, [view])

  const handleRequestReboot = async (inst: EC2Instance) => {
    const reason = window.prompt(`Submit restart request for ${inst.name}?\nReason:`)
    if (!reason) return
    try {
      await createRequest({ instanceId: inst.instanceId, instanceName: inst.name, reason })
      alert('Request submitted to queue')
    } catch (e: any) { alert('Failed: ' + e?.response?.data?.error || e.message) }
  }

  const openApprove = (req: RestartRequest) => {
    if (!totpEnabled) {
      alert('You must setup 2FA before approving requests.')
      handleOpenSetup()
      return
    }
    setApproveTarget(req)
    setOtpInput('')
    setOtpModalOpen(true)
  }

  const submitApprove = async () => {
    if (!approveTarget || !otpInput) return
    try {
      await approveRequestWithOTP(approveTarget.requestId, otpInput)
      setOtpModalOpen(false)
      fetchRequests()
      alert('Request approved and server rebooted.')
    } catch (e: any) {
      alert('Approval failed: ' + (e?.response?.data?.error || 'Invalid TOTP code'))
    }
  }

  const openDeny = (reqId: string) => {
    setDenyTarget(reqId)
    setDenyInput('')
    setDenyModalOpen(true)
  }

  const submitDeny = async () => {
    if (!denyTarget) return
    try {
      await denyRequest(denyTarget, denyInput)
      setDenyModalOpen(false)
      fetchRequests()
    } catch (e: any) { alert('Deny failed') }
  }

  const handleOpenSetup = async () => {
    try {
      const data = await getTOTPSetup()
      setTotpSetupData(data)
      setSetupModalOpen(true)
    } catch (e) { alert('Failed to get 2FA setup info') }
  }

  const submitSetup = async () => {
    if (!otpInput) return
    try {
      await verifyTOTPSetup(otpInput)
      setTotpEnabled(true)
      setSetupModalOpen(false)
      alert('2FA enabled successfully')
    } catch (e) { alert('Invalid code') }
  }

  const openLogs = async (instId: string, instName: string) => {
    setLogsTarget({ id: instId, name: instName })
    setRebootLogs([])
    setLogsModalOpen(true)
    try {
      setRebootLogs(await getRebootHistory(instId))
    } catch (e) { console.error('Failed to load logs') }
  }

  // --- Render Views ---

  if (view === 'ec2') {
    const filtered = ec2Filter === 'all' ? instances : instances.filter(i => i.state === ec2Filter)
    const running = instances.filter(i => i.state === 'running').length

    return (
      <div className="view-section active">
        <header className="top-nav">
          <div className="top-nav-left">
            <button className="btn-top-nav"><span className="icon" style={{ display: 'flex' }}><Server24Regular fontSize={18} /></span> EC2 List</button>
          </div>
          {!totpEnabled && (
            <div style={{ color: 'var(--status-pending)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldKeyhole24Regular fontSize={16} /> 2FA not set up
              <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={handleOpenSetup}>Setup 2FA</button>
            </div>
          )}
        </header>

        <div className="content-scroll">
          <div className="hero-banner">
            <div className="hero-left">
              <div className="date-block">
                <div id="date-num">{new Date().getDate()}</div>
              </div>
              <div className="hero-icon"><WeatherPartlyCloudyDay24Regular style={{ fontSize: 42 }} /></div>
              <div className="greeting-block">
                <h1>Admin EC2 Panel</h1>
                <p>Manage restartable instances</p>
              </div>
            </div>
            <div className="hero-right">
              <div className="hero-status-text">{instances.length} total, {running} running</div>
              <button className="btn-ghost" onClick={fetchInstances} disabled={loading}>
                {loading ? 'Scanning...' : <><ArrowClockwise20Regular style={{ marginRight: 6, verticalAlign: 'middle', marginBottom: 2 }} /> Scan</>}
              </button>
            </div>
          </div>

          <div className="filter-tabs">
            <button className={`tab ${ec2Filter === 'all' ? 'active' : ''}`} onClick={() => setEc2Filter('all')}>All</button>
            <button className={`tab ${ec2Filter === 'running' ? 'active' : ''}`} onClick={() => setEc2Filter('running')}>Running</button>
            <button className={`tab ${ec2Filter === 'stopped' ? 'active' : ''}`} onClick={() => setEc2Filter('stopped')}>Stopped</button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Server Name</th>
                  <th>Instance ID</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inst => (
                  <tr key={inst.instanceId} className="instance-row">
                    <td className="name-cell"><span className="server-icon" style={{ verticalAlign: 'middle', display: 'inline-block' }}><Server24Regular fontSize={16} /></span>{inst.name}</td>
                    <td className="id-cell">{inst.instanceId}</td>
                    <td>
                      <div className="status-badge">
                        <span className={`status-dot dot-${inst.state === 'running' ? 'running' : 'stopped'}`}></span>
                        {inst.state}
                      </div>
                    </td>
                    <td className="action-cell">
                      {inst.state === 'running' ? (
                        <button className="btn-action btn-danger-outline" onClick={() => handleRequestReboot(inst)}>
                          <Flash24Regular fontSize={14} style={{ marginRight: 6 }} /> Request Reboot
                        </button>
                      ) : <span className="no-action">—</span>}
                      <button className="btn-icon-action" title="View CloudTrail Logs" onClick={() => openLogs(inst.instanceId, inst.name)}>
                        <Document24Regular fontSize={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No instances found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* LOGS MODAL */}
        {logsModalOpen && (
          <div className="modal">
            <div className="modal-card" style={{ width: 600 }}>
              <div className="modal-header">
                <span className="modal-icon"><Document24Regular style={{ fontSize: 28 }} /></span>
                <div>
                  <h2>CloudTrail Logs</h2>
                  <p className="modal-subtitle">{logsTarget?.name} ({logsTarget?.id})</p>
                </div>
              </div>
              <div className="modal-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
                {rebootLogs.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No recent reboot events found.</p> : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {rebootLogs.map(log => (
                      <li key={log.eventId} style={{ borderBottom: '1px solid var(--border-light)', padding: '12px 0' }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{log.username} <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>{new Date(log.eventTime).toLocaleString()}</span></div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>Event ID: {log.eventId}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setLogsModalOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
        
        {/* SETUP MODAL */}
        {setupModalOpen && (
          <div className="modal">
            <div className="modal-card">
              <div className="modal-header">
                <span className="modal-icon"><ShieldKeyhole24Regular style={{ fontSize: 28 }} /></span>
                <div><h2>Setup 2FA</h2><p className="modal-subtitle">Scan QR with Authenticator app</p></div>
              </div>
              <div className="modal-body" style={{ textAlign: 'center' }}>
                {totpSetupData && (
                  <div style={{ background: '#fff', padding: 16, display: 'inline-block', borderRadius: 8, marginBottom: 16 }}>
                    <QRCodeSVG value={totpSetupData.otpauthUrl} size={150} />
                  </div>
                )}
                <label className="input-label" style={{ textAlign: 'left' }}>Enter 6-digit code:</label>
                <input type="text" className="sudo-input txt-input" style={{ textAlign: 'center', letterSpacing: 8 }} value={otpInput} onChange={e => setOtpInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitSetup()} />
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setSetupModalOpen(false)}>Cancel</button>
                <button className="btn-primary" onClick={submitSetup}>Verify</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // requests view
  const filteredReqs = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)
  
  return (
    <div className="view-section active">
      <header className="top-nav">
        <div className="top-nav-left">
          <button className="btn-top-nav"><span className="icon" style={{ display: 'flex' }}><Clipboard24Regular fontSize={18} /></span> Global Request Queue</button>
        </div>
      </header>

      <div className="content-scroll">
        <div className="hero-banner req-banner">
          <div className="hero-left">
            <div className="date-block highlight-badge">
              <div className="date-num lg-num">{requests.filter(r => r.status === 'pending').length}</div>
            </div>
            <div className="hero-icon"><MailInbox24Regular style={{ fontSize: 42 }} /></div>
            <div className="greeting-block">
              <h1>Approval Queue</h1>
              <p>Approve or deny infrastructure actions</p>
            </div>
          </div>
          <div className="hero-right">
            <button className="btn-ghost" onClick={fetchRequests} disabled={loading}>🔄 Refresh</button>
          </div>
        </div>

        <div className="filter-tabs">
          <button className={`tab ${reqFilter === 'all' ? 'active' : ''}`} onClick={() => setReqFilter('all')}>All</button>
          <button className={`tab ${reqFilter === 'pending' ? 'active' : ''}`} onClick={() => setReqFilter('pending')}>Pending</button>
          <button className={`tab ${reqFilter === 'approved' ? 'active' : ''}`} onClick={() => setReqFilter('approved')}>Approved</button>
          <button className={`tab ${reqFilter === 'denied' ? 'active' : ''}`} onClick={() => setReqFilter('denied')}>Denied</button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Requester</th>
                <th>Target</th>
                <th>Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReqs.map(req => (
                <tr key={req.requestId} className={`instance-row ${req.status === 'pending' ? 'row-pending' : ''}`}>
                  <td className="name-cell">{req.userName}</td>
                  <td><span className="server-icon" style={{ verticalAlign: 'middle', display: 'inline-block' }}><Server24Regular fontSize={16} /></span>{req.instanceName}</td>
                  <td className="id-cell">{new Date(req.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="status-badge">
                      <span className={`status-dot dot-${req.status === 'approved' ? 'running' : req.status === 'denied' ? 'stopped' : 'pending'}`}></span>
                      {req.status}
                    </div>
                  </td>
                  <td className="action-cell">
                    {req.status === 'pending' ? (
                      <>
                        <button className="btn-action" style={{ color: 'var(--status-running)', borderColor: 'rgba(108,193,123,0.3)' }} onClick={() => openApprove(req)}><CheckmarkCircle24Regular fontSize={14} style={{ marginRight: 4 }} /> Approve</button>
                        <button className="btn-icon-action" style={{ color: 'var(--status-stopped)', borderColor: 'rgba(224,108,108,0.3)' }} onClick={() => openDeny(req.requestId)}><DismissCircle24Regular fontSize={16} /></button>
                      </>
                    ) : req.status === 'denied' && req.denyReason ? (
                      <span className="deny-reason">{req.denyReason}</span>
                    ) : <span className="no-action">—</span>}
                  </td>
                </tr>
              ))}
              {filteredReqs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No requests found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* APPROVE OTP MODAL */}
        {otpModalOpen && (
          <div className="modal">
            <div className="modal-card">
              <div className="modal-header">
                <span className="modal-icon"><LockClosed24Regular style={{ fontSize: 28 }} /></span>
                <div><h2>Admin Approval</h2><p className="modal-subtitle">TOTP required to reboot {approveTarget?.instanceName}</p></div>
              </div>
              <div className="modal-body">
                <label className="input-label">Enter 6-digit Authenticator code:</label>
                <input type="text" autoFocus className="sudo-input txt-input" style={{ textAlign: 'center', letterSpacing: 8, fontSize: 24 }} value={otpInput} onChange={e => setOtpInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitApprove()} />
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setOtpModalOpen(false)}>Cancel</button>
                <button className="btn-primary" onClick={submitApprove}>Verify & Approve</button>
              </div>
            </div>
          </div>
        )}

        {/* DENY MODAL */}
        {denyModalOpen && (
          <div className="modal">
            <div className="modal-card">
              <div className="modal-header">
                <span className="modal-icon"><DismissCircle24Regular style={{ fontSize: 28, color: 'var(--status-stopped)' }} /></span>
                <div><h2>Deny Request</h2></div>
              </div>
              <div className="modal-body">
                <label className="input-label">Reason (optional):</label>
                <input type="text" autoFocus className="sudo-input txt-input" value={denyInput} onChange={e => setDenyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitDeny()} />
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setDenyModalOpen(false)}>Cancel</button>
                <button className="btn-danger" onClick={submitDeny}>Deny Request</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
