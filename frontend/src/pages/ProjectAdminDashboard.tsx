import { useState, useEffect } from 'react'
import {
  listMyProjects, listProjectRequests, approveProjectRequestWithOTP,
  denyProjectRequest, listProjectMembers, addProjectMember, removeProjectMember,
  listUsers, getTOTPSetup, verifyTOTPSetup, resetTOTP,
} from '../lib/api'
import type { CurrentUser, Project, ProjectMember, RestartRequest, User } from '../types'
import {
  Navigation24Regular, FolderOpen24Regular, People24Regular,
  CheckmarkCircle24Regular, DismissCircle24Regular, LockClosed24Regular,
  ShieldKeyhole24Regular, Server24Regular, Add24Regular, Delete24Regular,
  ArrowClockwise20Regular,
} from '@fluentui/react-icons'
import { QRCodeSVG } from 'qrcode.react'
import { Toast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'

interface Props {
  user: CurrentUser
  onToggleSidebar?: () => void
}

export function ProjectAdminDashboard({ user, onToggleSidebar }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [tab, setTab] = useState<'requests' | 'members'>('requests')
  const [requests, setRequests] = useState<RestartRequest[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [reqFilter, setReqFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const [totpEnabled, setTotpEnabled] = useState(user.totpEnabled ?? false)
  const [totpSetupData, setTotpSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null)
  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [approveTarget, setApproveTarget] = useState<RestartRequest | null>(null)
  const [denyModalOpen, setDenyModalOpen] = useState(false)
  const [denyTarget, setDenyTarget] = useState<RestartRequest | null>(null)
  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState('')
  const [denyInput, setDenyInput] = useState('')
  const [confirmResetTotp, setConfirmResetTotp] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [totpSecondsLeft, setTotpSecondsLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))
  useEffect(() => {
    const id = setInterval(() => setTotpSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    getTOTPSetup().catch((e: any) => {
      if (e?.response?.status === 409) setTotpEnabled(true)
    })
  }, [])

  useEffect(() => {
    listMyProjects().then(ps => {
      const adminProjects = ps // shown as project admin
      setProjects(adminProjects)
      if (adminProjects.length > 0 && !selectedProject) {
        setSelectedProject(adminProjects[0])
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    if (tab === 'requests') fetchRequests()
    if (tab === 'members') fetchMembers()
  }, [selectedProject, tab])

  const fetchRequests = async () => {
    if (!selectedProject) return
    setLoading(true)
    try { setRequests(await listProjectRequests(selectedProject.projectId)) } catch { /* ignore */ }
    setLoading(false)
  }

  const fetchMembers = async () => {
    if (!selectedProject) return
    setLoading(true)
    try {
      const [m, u] = await Promise.all([
        listProjectMembers(selectedProject.projectId).catch(() => [] as ProjectMember[]),
        listUsers().catch(() => [] as User[]),
      ])
      setMembers(m)
      setAllUsers(u)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error' = 'error') => setToast({ message, type })

  // ── TOTP ────────────────────────────────────────────────────────────────────

  const handleOpenSetup = async () => {
    try {
      const data = await getTOTPSetup()
      setTotpSetupData(data)
      setOtpInput('')
      setSetupModalOpen(true)
    } catch (e: any) {
      if (e?.response?.status === 409) { setTotpEnabled(true); return }
      showToast('Failed to get 2FA setup info')
    }
  }

  const handleSetupOtpChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6)
    setOtpInput(digits)
    if (digits.length === 6) {
      verifyTOTPSetup(digits)
        .then(() => { setTotpEnabled(true); setSetupModalOpen(false) })
        .catch(() => { showToast('Invalid code, try again'); setOtpInput('') })
    }
  }

  const doRelinkTOTP = async () => {
    setConfirmResetTotp(false)
    try {
      await resetTOTP()
      setTotpEnabled(false)
      const data = await getTOTPSetup()
      setTotpSetupData(data)
      setOtpInput('')
      setSetupModalOpen(true)
    } catch { showToast('Failed to reset 2FA') }
  }

  // ── Approve / Deny ──────────────────────────────────────────────────────────

  const openApprove = (req: RestartRequest) => {
    if (!totpEnabled) { handleOpenSetup(); return }
    setApproveTarget(req)
    setOtpInput('')
    setOtpError('')
    setOtpModalOpen(true)
  }

  const submitApprove = async (code: string) => {
    if (!approveTarget || code.length !== 6 || !selectedProject) return
    try {
      await approveProjectRequestWithOTP(selectedProject.projectId, approveTarget.requestId, code)
      setOtpModalOpen(false)
      const op = approveTarget.operation || 'reboot'
      showToast(`${op.charAt(0).toUpperCase() + op.slice(1)} approved for ${approveTarget.instanceName}`, 'success')
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

  const submitDeny = async () => {
    if (!denyTarget || !selectedProject) return
    try {
      await denyProjectRequest(selectedProject.projectId, denyTarget.requestId, denyInput)
      setDenyModalOpen(false)
      fetchRequests()
    } catch { showToast('Deny failed') }
  }

  // ── Members ──────────────────────────────────────────────────────────────────

  const handleAddMember = async (uid: string, role: 'admin' | 'member') => {
    if (!selectedProject) return
    try {
      const m = await addProjectMember(selectedProject.projectId, uid, role)
      setMembers(prev => [...prev, m])
      showToast('Member added', 'success')
    } catch { showToast('Failed to add member') }
  }

  const handleRemoveMember = async (uid: string) => {
    if (!selectedProject) return
    try {
      await removeProjectMember(selectedProject.projectId, uid)
      setMembers(prev => prev.filter(m => m.userId !== uid))
    } catch { showToast('Failed to remove member') }
  }

  const timerColor = totpSecondsLeft <= 5 ? '#ef5350' : totpSecondsLeft <= 10 ? '#f5a623' : '#50c878'
  const assignedIds = new Set(members.map(m => m.userId))
  const unassignedUsers = allUsers.filter(u => u.role === 'user' && !assignedIds.has(u.teamsUserId))
  const filteredReqs = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)

  const totpWarning = (
    <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      {!totpEnabled
        ? <><ShieldKeyhole24Regular fontSize={16} style={{ color: 'var(--status-pending)' }} />
            <span style={{ color: 'var(--status-pending)' }}>2FA not set up</span>
            <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={handleOpenSetup}>Setup 2FA</button>
          </>
        : <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12, color: 'var(--text-muted)' }} onClick={() => setConfirmResetTotp(true)}>
            <ShieldKeyhole24Regular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Re-link 2FA
          </button>
      }
    </div>
  )

  return (
    <div className="view-section active">
      <header className="top-nav">
        <div className="top-nav-left">
          <button className="mobile-menu-btn" onClick={onToggleSidebar}><Navigation24Regular /></button>
          <button className="btn-top-nav">
            <span className="icon" style={{ display: 'flex' }}><FolderOpen24Regular fontSize={18} /></span>
            My Projects
          </button>
        </div>
        <div className="top-nav-right">{totpWarning}</div>
      </header>

      <div className="content-scroll">
        {projects.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <FolderOpen24Regular style={{ fontSize: 48, marginBottom: 12 }} />
            <p>You are not a project admin of any project yet.</p>
          </div>
        ) : (
          <>
            {/* Project selector tabs */}
            <div className="filter-tabs" style={{ padding: '12px 20px 0' }}>
              {projects.map(p => (
                <button key={p.projectId} className={`tab ${selectedProject?.projectId === p.projectId ? 'active' : ''}`} onClick={() => { setSelectedProject(p); setTab('requests') }}>
                  {p.name}
                </button>
              ))}
            </div>

            {selectedProject && (
              <>
                <div className="filter-tabs" style={{ padding: '8px 20px 0' }}>
                  <button className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
                    Requests {tab === 'requests' && requests.filter(r => r.status === 'pending').length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{requests.filter(r => r.status === 'pending').length}</span>}
                  </button>
                  <button className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>
                    <People24Regular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Members ({tab === 'members' ? members.length : (selectedProject.memberCount ?? 0)})
                  </button>
                  <button className="btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }} onClick={tab === 'requests' ? fetchRequests : fetchMembers} disabled={loading}>
                    <ArrowClockwise20Regular fontSize={14} />
                  </button>
                </div>

                {/* Requests tab */}
                {tab === 'requests' && (
                  <>
                    <div className="filter-tabs" style={{ padding: '8px 20px 0' }}>
                      {['all', 'pending', 'approved', 'denied'].map(f => (
                        <button key={f} className={`tab ${reqFilter === f ? 'active' : ''}`} onClick={() => setReqFilter(f)}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="table-container">
                      <table className="data-table">
                        <thead><tr><th>Requester</th><th>Instance</th><th>Operation</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                          {filteredReqs.map(req => (
                            <tr key={req.requestId} className={`instance-row ${req.status === 'pending' ? 'row-pending' : ''}`}>
                              <td className="name-cell">{req.userName}</td>
                              <td><Server24Regular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />{req.instanceName}</td>
                              <td><span className={`op-badge op-${req.operation || 'reboot'}`}>{req.operation || 'reboot'}</span></td>
                              <td className="id-cell">{new Date(req.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                              <td><div className="status-badge"><span className={`status-dot dot-${req.status === 'approved' ? 'running' : req.status === 'denied' ? 'stopped' : 'pending'}`} />{req.status}</div></td>
                              <td className="action-cell">
                                {req.status === 'pending' ? (
                                  <>
                                    <button className="btn-action" style={{ color: 'var(--status-running)', borderColor: 'rgba(108,193,123,0.3)' }} onClick={() => openApprove(req)}>
                                      <CheckmarkCircle24Regular fontSize={14} style={{ marginRight: 4 }} />Approve
                                    </button>
                                    <button className="btn-icon-action" style={{ color: 'var(--status-stopped)' }} onClick={() => { setDenyTarget(req); setDenyInput(''); setDenyModalOpen(true) }}>
                                      <DismissCircle24Regular fontSize={16} />
                                    </button>
                                  </>
                                ) : req.status === 'denied' && req.denyReason
                                  ? <span className="deny-reason">{req.denyReason}</span>
                                  : <span className="no-action">—</span>
                                }
                              </td>
                            </tr>
                          ))}
                          {filteredReqs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No requests found</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Members tab */}
                {tab === 'members' && (
                  <div style={{ padding: '0 20px' }}>
                    {members.length > 0 && (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Members</div>
                        <div className="table-container">
                          <table className="data-table">
                            <thead><tr><th>User</th><th>Role</th><th></th></tr></thead>
                            <tbody>
                              {members.map(m => (
                                <tr key={m.userId} className="instance-row">
                                  <td className="name-cell">{m.userName || m.userId}</td>
                                  <td>
                                    <span style={{ background: m.role === 'admin' ? 'rgba(123,104,238,0.15)' : 'rgba(80,200,120,0.15)', color: m.role === 'admin' ? '#7b68ee' : '#50c878', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                                      {m.role}
                                    </span>
                                  </td>
                                  <td>
                                    <button className="btn-icon-action" style={{ color: 'var(--status-stopped)' }} onClick={() => handleRemoveMember(m.userId)}>
                                      <Delete24Regular fontSize={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {unassignedUsers.length > 0 && (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add User</div>
                        <div className="table-container">
                          <table className="data-table">
                            <thead><tr><th>User</th><th>Email</th><th></th></tr></thead>
                            <tbody>
                              {unassignedUsers.map(u => (
                                <tr key={u.teamsUserId} className="instance-row">
                                  <td className="name-cell">{u.displayName}</td>
                                  <td className="id-cell">{u.email}</td>
                                  <td className="action-cell">
                                    <button className="btn-action btn-action-success" style={{ fontSize: 12 }} onClick={() => handleAddMember(u.teamsUserId, 'member')}>
                                      <Add24Regular fontSize={13} style={{ marginRight: 3 }} />Member
                                    </button>
                                    <button className="btn-action" style={{ fontSize: 12, color: '#7b68ee', borderColor: 'rgba(123,104,238,0.3)' }} onClick={() => handleAddMember(u.teamsUserId, 'admin')}>
                                      <Add24Regular fontSize={13} style={{ marginRight: 3 }} />Admin
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* TOTP Setup Modal */}
      {setupModalOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-icon"><ShieldKeyhole24Regular style={{ fontSize: 28 }} /></span>
              <div><h2>Setup 2FA</h2><p className="modal-subtitle">Required to approve requests</p></div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              {totpSetupData && (
                <div style={{ background: '#fff', padding: 16, display: 'inline-block', borderRadius: 8, marginBottom: 16 }}>
                  <QRCodeSVG value={totpSetupData.otpauthUrl} size={160} />
                </div>
              )}
              <input autoFocus type="text" inputMode="numeric" className="sudo-input txt-input"
                placeholder="Enter 6-digit code to confirm"
                style={{ textAlign: 'center', letterSpacing: 8, fontSize: 22 }}
                value={otpInput} onChange={e => handleSetupOtpChange(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setSetupModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => {
                verifyTOTPSetup(otpInput)
                  .then(() => { setTotpEnabled(true); setSetupModalOpen(false) })
                  .catch(() => showToast('Invalid code'))
              }}>Verify</button>
            </div>
          </div>
        </div>
      )}

      {/* OTP Approve Modal */}
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
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s' }} />
                  <text x="18" y="23" textAnchor="middle" fontSize="11" fill={timerColor} fontWeight="700">{totpSecondsLeft}</text>
                </svg>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {totpSecondsLeft <= 5 ? 'Code expiring — wait for next' : 'Open Authenticator app'}
                </span>
              </div>
              <input autoFocus type="text" inputMode="numeric" className="sudo-input txt-input"
                placeholder="• • • • • •"
                style={{ textAlign: 'center', letterSpacing: 12, fontSize: 32, width: '100%' }}
                value={otpInput} onChange={e => handleApproveOtpChange(e.target.value)} />
              {otpError && <div style={{ color: '#ef5350', fontSize: 12, marginTop: 8 }}>{otpError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setOtpModalOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={otpInput.length !== 6} onClick={() => submitApprove(otpInput)}>Verify & Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* Deny Modal */}
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

      {confirmResetTotp && (
        <ConfirmDialog title="Reset 2FA" message="Remove current 2FA link? You will need to re-scan." confirmLabel="Reset" danger
          onConfirm={doRelinkTOTP} onCancel={() => setConfirmResetTotp(false)} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
