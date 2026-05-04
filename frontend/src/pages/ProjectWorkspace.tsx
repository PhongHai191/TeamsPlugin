import { useState, useEffect } from 'react'
import {
  listInstances, listMyRequests, createRequest,
  listProjectRequests, approveProjectRequestWithOTP, denyProjectRequest,
  listProjectMembers, addProjectMember, removeProjectMember,
  listUsers, getRebootHistory,
  getTOTPSetup, verifyTOTPSetup, resetTOTP,
} from '../lib/api'
import type { CurrentUser, EC2Instance, OperationType, Project, ProjectMember, RestartRequest, User } from '../types'
import { Toast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { OperationRequestModal } from '../components/OperationRequestModal'
import { QRCodeSVG } from 'qrcode.react'
import {
  Navigation24Regular, Server24Regular, Clipboard24Regular, People24Regular,
  CheckmarkCircle24Regular, DismissCircle24Regular, LockClosed24Regular,
  ShieldKeyhole24Regular, Document24Regular, Add24Regular, Delete24Regular,
  ArrowClockwise20Regular, Flash24Regular, Power24Regular, Play24Regular,
} from '@fluentui/react-icons'

type ProjectTab = 'ec2' | 'requests' | 'my-requests' | 'members'

interface Props {
  project: Project
  user: CurrentUser
  onToggleSidebar?: () => void
}

export function ProjectWorkspace({ project, user, onToggleSidebar }: Props) {
  const isGlobalPrivileged = user.role === 'admin' || user.role === 'root'

  const [myProjectRole, setMyProjectRole] = useState<'admin' | 'member'>(
    isGlobalPrivileged ? 'admin' : 'member'
  )
  const canApprove = myProjectRole === 'admin'

  const tabs: { id: ProjectTab; label: string }[] = canApprove
    ? [
        { id: 'ec2', label: 'EC2 List' },
        { id: 'requests', label: 'Requests' },
        { id: 'members', label: 'Members' },
      ]
    : [
        { id: 'ec2', label: 'EC2 List' },
        { id: 'my-requests', label: 'My Requests' },
      ]

  const [tab, setTab] = useState<ProjectTab>('ec2')

  const [instances, setInstances] = useState<EC2Instance[]>([])
  const [requests, setRequests] = useState<RestartRequest[]>([])
  const [myRequests, setMyRequests] = useState<RestartRequest[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)

  const [ec2Filter, setEc2Filter] = useState('all')
  const [reqFilter, setReqFilter] = useState('all')
  const [myReqFilter, setMyReqFilter] = useState('all')

  const [totpEnabled, setTotpEnabled] = useState(user.totpEnabled ?? false)
  const [totpSetupData, setTotpSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null)
  const [totpSecondsLeft, setTotpSecondsLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))

  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [approveTarget, setApproveTarget] = useState<RestartRequest | null>(null)
  const [denyModalOpen, setDenyModalOpen] = useState(false)
  const [denyTarget, setDenyTarget] = useState<RestartRequest | null>(null)
  const [logsModalOpen, setLogsModalOpen] = useState(false)
  const [logsTarget, setLogsTarget] = useState<{ id: string; name: string } | null>(null)
  const [rebootLogs, setRebootLogs] = useState<RestartRequest[]>([])
  const [opRequest, setOpRequest] = useState<{ inst: EC2Instance; operation: OperationType } | null>(null)
  const [confirmResetTotp, setConfirmResetTotp] = useState(false)

  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState('')
  const [denyInput, setDenyInput] = useState('')
  const [userSearch, setUserSearch] = useState('')

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'error') => setToast({ message, type })

  const timerColor = totpSecondsLeft <= 5 ? '#ef5350' : totpSecondsLeft <= 10 ? '#f5a623' : '#50c878'

  useEffect(() => {
    const id = setInterval(() => setTotpSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30)), 1000)
    return () => clearInterval(id)
  }, [])

  // Reset state and determine role when project changes
  useEffect(() => {
    setTab('ec2')
    setEc2Filter('all')
    setReqFilter('all')
    setMyReqFilter('all')
    setInstances([])
    setRequests([])
    setMyRequests([])
    setMembers([])

    getTOTPSetup().catch((e: any) => {
      if (e?.response?.status === 409) setTotpEnabled(true)
    })

    if (!isGlobalPrivileged) {
      listProjectMembers(project.projectId).then(ms => {
        setMembers(ms)
        const me = ms.find(m => m.userId === user.teamsUserId)
        setMyProjectRole(me?.role === 'admin' ? 'admin' : 'member')
      }).catch(() => setMyProjectRole('member'))
    }
  }, [project.projectId])

  useEffect(() => {
    if (tab === 'ec2') fetchInstances()
    else if (tab === 'requests') fetchRequests()
    else if (tab === 'my-requests') fetchMyRequests()
    else if (tab === 'members') fetchMembers()
  }, [tab, project.projectId])

  const fetchInstances = async () => {
    setLoading(true)
    try {
      const all = await listInstances()
      if (isGlobalPrivileged) {
        // admin/root: backend doesn't set projectId — match by project's instanceIds list
        const allowed = new Set(project.instanceIds)
        setInstances(all.filter(i => allowed.has(i.instanceId)))
      } else {
        // user role: backend sets projectId correctly
        setInstances(all.filter(i => i.projectId === project.projectId))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const fetchRequests = async () => {
    setLoading(true)
    try { setRequests(await listProjectRequests(project.projectId)) } catch { /* ignore */ }
    setLoading(false)
  }

  const fetchMyRequests = async () => {
    setLoading(true)
    try {
      const all = await listMyRequests()
      setMyRequests(all.filter(r => r.projectId === project.projectId))
    } catch { /* ignore */ }
    setLoading(false)
  }

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const [ms, us] = await Promise.all([
        listProjectMembers(project.projectId).catch(() => [] as ProjectMember[]),
        isGlobalPrivileged ? listUsers().catch(() => [] as User[]) : Promise.resolve([] as User[]),
      ])
      setMembers(ms)
      setAllUsers(us)
    } catch { /* ignore */ }
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
      await approveProjectRequestWithOTP(project.projectId, approveTarget.requestId, code)
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
    if (!denyTarget) return
    try {
      await denyProjectRequest(project.projectId, denyTarget.requestId, denyInput)
      setDenyModalOpen(false)
      fetchRequests()
    } catch { showToast('Deny failed') }
  }

  const handleAddMember = async (uid: string, role: 'admin' | 'member') => {
    try {
      const m = await addProjectMember(project.projectId, uid, role)
      setMembers(prev => [...prev, m])
      showToast('Member added', 'success')
    } catch { showToast('Failed to add member') }
  }

  const handleRemoveMember = async (uid: string) => {
    try {
      await removeProjectMember(project.projectId, uid)
      setMembers(prev => prev.filter(m => m.userId !== uid))
      showToast('Member removed', 'success')
    } catch (e: any) { showToast(e?.response?.data?.error || 'Failed to remove member') }
  }

  const submitOperation = async (inst: EC2Instance, operation: OperationType, reason: string) => {
    setOpRequest(null)
    const label = operation.charAt(0).toUpperCase() + operation.slice(1)
    try {
      await createRequest({
        instanceId: inst.instanceId, instanceName: inst.name, reason,
        region: inst.region, operation, project: inst.project,
        accountId: inst.accountId, projectId: inst.projectId,
      })
      showToast(`${label} request submitted`, 'success')
    } catch (e: any) { showToast('Failed: ' + (e?.response?.data?.error || e.message)) }
  }

  const openLogs = async (instId: string, instName: string) => {
    setLogsTarget({ id: instId, name: instName })
    setRebootLogs([])
    setLogsModalOpen(true)
    try { setRebootLogs(await getRebootHistory(instId)) } catch { /* ignore */ }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const filteredInstances = instances.filter(i => ec2Filter === 'all' || i.state === ec2Filter)
  const filteredRequests = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)
  const filteredMyReqs = myReqFilter === 'all' ? myRequests : myRequests.filter(r => r.status === myReqFilter)
  const assignedIds = new Set(members.map(m => m.userId))
  const unassignedUsers = allUsers.filter(u => u.role === 'user' && !assignedIds.has(u.teamsUserId))
  const searchedUsers = userSearch.trim()
    ? unassignedUsers.filter(u =>
        u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : unassignedUsers

  const totpWarning = (
    <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      {!totpEnabled
        ? <>
            <ShieldKeyhole24Regular fontSize={16} style={{ color: 'var(--status-pending)' }} />
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
          <button className="mobile-menu-btn" onClick={onToggleSidebar}>
            <Navigation24Regular />
          </button>
          <div className="project-tabs">
            {tabs.map(t => (
              <button
                key={t.id}
                className={`project-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.id === 'ec2' && <Server24Regular fontSize={14} />}
                {(t.id === 'requests' || t.id === 'my-requests') && <Clipboard24Regular fontSize={14} />}
                {t.id === 'members' && <People24Regular fontSize={14} />}
                {t.label}
                {t.id === 'requests' && pendingCount > 0 && (
                  <span className="tab-badge">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        {canApprove && <div className="top-nav-right">{totpWarning}</div>}
      </header>

      <div className="content-scroll">

        {/* EC2 tab */}
        {tab === 'ec2' && (
          <>
            <div className="filter-tabs">
              {['all', 'running', 'stopped'].map(f => (
                <button key={f} className={`tab ${ec2Filter === f ? 'active' : ''}`} onClick={() => setEc2Filter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <button className="btn-ghost" style={{ marginLeft: 'auto', marginBottom: 8, fontSize: 12, padding: '3px 10px' }} onClick={fetchInstances} disabled={loading}>
                <ArrowClockwise20Regular fontSize={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {loading ? 'Scanning...' : 'Scan'}
              </button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr>
                  <th>Server Name</th><th>Instance ID</th><th>Region</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {filteredInstances.map(inst => (
                    <tr key={inst.instanceId} className="instance-row">
                      <td className="name-cell">
                        <span className="server-icon" style={{ verticalAlign: 'middle', display: 'inline-block' }}><Server24Regular fontSize={16} /></span>
                        {inst.name}
                      </td>
                      <td className="id-cell">{inst.instanceId}</td>
                      <td className="id-cell" style={{ fontSize: 12 }}>{inst.region}</td>
                      <td>
                        <div className="status-badge">
                          <span className={`status-dot dot-${inst.state === 'running' ? 'running' : 'stopped'}`} />
                          {inst.state}
                        </div>
                      </td>
                      <td className="action-cell">
                        {inst.state === 'running' ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn-action btn-danger-outline" onClick={() => setOpRequest({ inst, operation: 'reboot' })}>
                              <Flash24Regular fontSize={14} style={{ marginRight: 4 }} />Reboot
                            </button>
                            <button className="btn-action btn-action-danger" onClick={() => setOpRequest({ inst, operation: 'stop' })}>
                              <Power24Regular fontSize={14} style={{ marginRight: 4 }} />Stop
                            </button>
                          </div>
                        ) : inst.state === 'stopped' ? (
                          <button className="btn-action btn-action-success" onClick={() => setOpRequest({ inst, operation: 'start' })}>
                            <Play24Regular fontSize={14} style={{ marginRight: 4 }} />Start
                          </button>
                        ) : <span className="no-action">—</span>}
                        {canApprove && (
                          <button className="btn-icon-action" title="Operation History" onClick={() => openLogs(inst.instanceId, inst.name)}>
                            <Document24Regular fontSize={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredInstances.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      {loading ? 'Loading...' : 'No instances found'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Requests tab */}
        {tab === 'requests' && (
          <>
            <div className="filter-tabs">
              {['all', 'pending', 'approved', 'denied'].map(f => (
                <button key={f} className={`tab ${reqFilter === f ? 'active' : ''}`} onClick={() => setReqFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <button className="btn-ghost" style={{ marginLeft: 'auto', marginBottom: 8, fontSize: 12, padding: '3px 10px' }} onClick={fetchRequests} disabled={loading}>
                <ArrowClockwise20Regular fontSize={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr>
                  <th>Requester</th><th>Instance</th><th>Operation</th><th>Time</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {filteredRequests.map(req => (
                    <tr key={req.requestId} className={`instance-row ${req.status === 'pending' ? 'row-pending' : ''}`}>
                      <td className="name-cell">{req.userName}</td>
                      <td>
                        <Server24Regular fontSize={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {req.instanceName}
                      </td>
                      <td><span className={`op-badge op-${req.operation || 'reboot'}`}>{req.operation || 'reboot'}</span></td>
                      <td className="id-cell">{new Date(req.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        <div className="status-badge">
                          <span className={`status-dot dot-${req.status === 'approved' ? 'running' : req.status === 'denied' ? 'stopped' : 'pending'}`} />
                          {req.status}
                        </div>
                      </td>
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
                          : <span className="no-action">—</span>}
                      </td>
                    </tr>
                  ))}
                  {filteredRequests.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      {loading ? 'Loading...' : 'No requests found'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* My Requests tab */}
        {tab === 'my-requests' && (
          <>
            <div className="filter-tabs">
              {['all', 'pending', 'approved', 'denied'].map(f => (
                <button key={f} className={`tab ${myReqFilter === f ? 'active' : ''}`} onClick={() => setMyReqFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <button className="btn-ghost" style={{ marginLeft: 'auto', marginBottom: 8, fontSize: 12, padding: '3px 10px' }} onClick={fetchMyRequests} disabled={loading}>
                <ArrowClockwise20Regular fontSize={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr>
                  <th>Instance</th><th>Operation</th><th>Reason</th><th>Time</th><th>Status</th><th>Deny Reason</th>
                </tr></thead>
                <tbody>
                  {filteredMyReqs.map(req => (
                    <tr key={req.requestId} className={`instance-row ${req.status === 'pending' ? 'row-pending' : ''}`}>
                      <td className="name-cell">
                        <Server24Regular fontSize={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {req.instanceName}
                      </td>
                      <td><span className={`op-badge op-${req.operation || 'reboot'}`}>{req.operation || 'reboot'}</span></td>
                      <td style={{ maxWidth: 200 }}>{req.reason}</td>
                      <td className="id-cell">{new Date(req.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        <div className="status-badge">
                          <span className={`status-dot dot-${req.status === 'approved' ? 'running' : req.status === 'denied' ? 'stopped' : 'pending'}`} />
                          {req.status}
                        </div>
                      </td>
                      <td>{req.status === 'denied' && req.denyReason ? <span className="deny-reason">{req.denyReason}</span> : <span className="no-action">—</span>}</td>
                    </tr>
                  ))}
                  {filteredMyReqs.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      {loading ? 'Loading...' : 'No requests found'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Members tab */}
        {tab === 'members' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={fetchMembers} disabled={loading}>
                <ArrowClockwise20Regular fontSize={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {members.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Current Members</div>
                <div className="table-container">
                  <table className="data-table">
                    <thead><tr><th>User</th><th>Role</th><th>Added</th><th></th></tr></thead>
                    <tbody>
                      {members.map(m => {
                        const isSelf = m.userId === user.teamsUserId
                        const cannotRemove = isSelf || (!isGlobalPrivileged && m.role === 'admin')
                        return (
                          <tr key={m.userId} className="instance-row">
                            <td className="name-cell">
                              {m.userName || m.userId}
                              {isSelf && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>(you)</span>}
                            </td>
                            <td>
                              <span style={{
                                background: m.role === 'admin' ? 'rgba(123,104,238,0.15)' : 'rgba(80,200,120,0.15)',
                                color: m.role === 'admin' ? '#7b68ee' : '#50c878',
                                borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                              }}>
                                {m.role}
                              </span>
                            </td>
                            <td className="id-cell">{m.addedAt ? new Date(m.addedAt).toLocaleDateString('en-GB') : '—'}</td>
                            <td>
                              <button
                                className="btn-icon-action"
                                disabled={cannotRemove}
                                title={isSelf ? 'Cannot remove yourself' : m.role === 'admin' && !isGlobalPrivileged ? 'Only global admin can remove a project admin' : 'Remove member'}
                                style={{ color: cannotRemove ? 'var(--text-muted)' : 'var(--status-stopped)', cursor: cannotRemove ? 'not-allowed' : 'pointer' }}
                                onClick={() => !cannotRemove && handleRemoveMember(m.userId)}
                              >
                                <Delete24Regular fontSize={16} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {isGlobalPrivileged && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Add User</div>
                <input
                  className="txt-input"
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  style={{ marginBottom: 8, maxWidth: 360 }}
                />
                {userSearch.trim() && searchedUsers.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No users found</div>
                )}
                {searchedUsers.length > 0 && (
                  <div className="table-container">
                    <table className="data-table">
                      <thead><tr><th>User</th><th>Email</th><th></th></tr></thead>
                      <tbody>
                        {searchedUsers.map(u => (
                          <tr key={u.teamsUserId} className="instance-row">
                            <td className="name-cell">{u.displayName}</td>
                            <td className="id-cell">{u.email}</td>
                            <td className="action-cell">
                              <button className="btn-action btn-action-success" style={{ fontSize: 12 }} onClick={() => { handleAddMember(u.teamsUserId, 'member'); setUserSearch('') }}>
                                <Add24Regular fontSize={13} style={{ marginRight: 3 }} />Member
                              </button>
                              <button className="btn-action" style={{ fontSize: 12, color: '#7b68ee', borderColor: 'rgba(123,104,238,0.3)' }} onClick={() => { handleAddMember(u.teamsUserId, 'admin'); setUserSearch('') }}>
                                <Add24Regular fontSize={13} style={{ marginRight: 3 }} />Admin
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {members.length === 0 && !loading && (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <People24Regular style={{ fontSize: 48, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
                <p>No members yet</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}

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
              <div><h2>Operation History</h2><p className="modal-subtitle">{logsTarget?.name} ({logsTarget?.id})</p></div>
            </div>
            <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {rebootLogs.length === 0
                ? <p style={{ color: 'var(--text-muted)' }}>No operation records found.</p>
                : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {rebootLogs.map(r => (
                      <li key={r.requestId} style={{ borderBottom: '1px solid var(--border-light)', padding: '12px 4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckmarkCircle24Regular fontSize={13} style={{ color: 'var(--status-running)' }} />
                            <span className={`op-badge op-${r.operation || 'reboot'}`}>{r.operation || 'reboot'}</span>
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {new Date(r.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span><span style={{ color: 'var(--text-muted)' }}>Requested by:</span> <strong>{r.userName}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)' }}>Approved by:</span> <strong>{r.approvedByName || r.approvedBy || '—'}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)' }}>Reason:</span> {r.reason}</span>
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

      {confirmResetTotp && (
        <ConfirmDialog title="Reset 2FA" message="Remove current 2FA link? You will need to re-scan." confirmLabel="Reset" danger
          onConfirm={doRelinkTOTP} onCancel={() => setConfirmResetTotp(false)} />
      )}

      {opRequest && (
        <OperationRequestModal
          inst={opRequest.inst}
          operation={opRequest.operation}
          onSubmit={submitOperation}
          onCancel={() => setOpRequest(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
