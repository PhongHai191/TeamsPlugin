import { useState, useEffect } from 'react'
import {
  listAllProjects, deleteProject, listAccounts, listAccountInstances,
  listUsers, createProject, listProjectMembers, addProjectMember,
  removeProjectMember, updateProjectMemberRole,
} from '../lib/api'
import type { AWSAccount, EC2Instance, Project, ProjectMember, User } from '../types'
import {
  Navigation24Regular, FolderOpen24Regular, Add24Regular, Delete24Regular,
  People24Regular, Server24Regular, ArrowClockwise20Regular, ArrowLeft24Regular,
  CheckmarkCircle24Regular, ArrowSwap24Regular,
} from '@fluentui/react-icons'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'

interface Props {
  onToggleSidebar?: () => void
}

type Step = 'list' | 'create-account' | 'create-instances' | 'create-members'

export function ProjectManagement({ onToggleSidebar }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('list')
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Detail modal
  const [detailProject, setDetailProject] = useState<Project | null>(null)
  const [detailMembers, setDetailMembers] = useState<ProjectMember[]>([])

  // Create wizard state
  const [accounts, setAccounts] = useState<AWSAccount[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [wizardName, setWizardName] = useState('')
  const [wizardAccount, setWizardAccount] = useState<AWSAccount | null>(null)
  const [accountInstances, setAccountInstances] = useState<EC2Instance[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set())
  const [projectAdmins, setProjectAdmins] = useState<Set<string>>(new Set())
  const [projectMembers, setProjectMembers] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const showToast = (message: string, type: 'success' | 'error' = 'error') => setToast({ message, type })

  const fetchProjects = async () => {
    setLoading(true)
    try { setProjects(await listAllProjects()) } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchProjects() }, [])

  const openCreateWizard = async () => {
    setWizardName('')
    setWizardAccount(null)
    setAccountInstances([])
    setSelectedInstanceIds(new Set())
    setProjectAdmins(new Set())
    setProjectMembers(new Set())
    const [accs, users] = await Promise.all([
      listAccounts().catch(() => [] as AWSAccount[]),
      listUsers().catch(() => [] as User[]),
    ])
    setAccounts(accs)
    setAllUsers(users)
    setStep('create-account')
  }

  const handleSelectAccount = async (acc: AWSAccount) => {
    setWizardAccount(acc)
    setLoadingInstances(true)
    setAccountInstances([])
    setSelectedInstanceIds(new Set())
    try {
      const insts = await listAccountInstances(acc.accountId)
      setAccountInstances(insts)
    } catch {
      showToast('Failed to load instances from this account')
    }
    setLoadingInstances(false)
    setStep('create-instances')
  }

  const toggleInstance = (id: string) => {
    setSelectedInstanceIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAdmin = (uid: string) => {
    setProjectAdmins(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
    setProjectMembers(prev => {
      const next = new Set(prev)
      next.delete(uid)
      return next
    })
  }

  const toggleMember = (uid: string) => {
    if (projectAdmins.has(uid)) return
    setProjectMembers(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  const handleCreate = async () => {
    if (!wizardAccount || !wizardName.trim()) return
    setSaving(true)
    try {
      await createProject({
        name: wizardName.trim(),
        accountId: wizardAccount.accountId,
        instanceIds: Array.from(selectedInstanceIds),
        projectAdmins: Array.from(projectAdmins),
        members: Array.from(projectMembers),
      })
      showToast('Project created', 'success')
      setStep('list')
      await fetchProjects()
    } catch (e: any) {
      showToast('Failed: ' + (e?.response?.data?.error || e.message))
    }
    setSaving(false)
  }

  const openDetail = async (p: Project) => {
    setDetailProject(p)
    const [members, users] = await Promise.all([
      listProjectMembers(p.projectId).catch(() => [] as ProjectMember[]),
      allUsers.length > 0 ? Promise.resolve(allUsers) : listUsers().catch(() => [] as User[]),
    ])
    setDetailMembers(members)
    if (allUsers.length === 0) setAllUsers(users)
  }

  const handleDetailRemove = async (uid: string) => {
    if (!detailProject) return
    try {
      await removeProjectMember(detailProject.projectId, uid)
      setDetailMembers(prev => prev.filter(m => m.userId !== uid))
      setProjects(prev => prev.map(p => p.projectId === detailProject.projectId ? { ...p, memberCount: (p.memberCount ?? 1) - 1 } : p))
      showToast('Member removed', 'success')
    } catch (e: any) { showToast(e?.response?.data?.error || 'Failed to remove') }
  }

  const handleDetailToggleRole = async (m: ProjectMember) => {
    if (!detailProject) return
    const newRole = m.role === 'admin' ? 'member' : 'admin'
    try {
      const updated = await updateProjectMemberRole(detailProject.projectId, m.userId, newRole)
      setDetailMembers(prev => prev.map(x => x.userId === m.userId ? { ...x, role: updated.role } : x))
      showToast(`${m.userName} is now ${newRole}`, 'success')
    } catch (e: any) { showToast(e?.response?.data?.error || 'Failed to update role') }
  }

  const handleDetailAddMember = async (uid: string, role: 'admin' | 'member') => {
    if (!detailProject) return
    try {
      const added = await addProjectMember(detailProject.projectId, uid, role)
      setDetailMembers(prev => [...prev, added])
      setProjects(prev => prev.map(p => p.projectId === detailProject.projectId ? { ...p, memberCount: (p.memberCount ?? 0) + 1 } : p))
      showToast(`${added.userName || uid} added as ${role}`, 'success')
    } catch (e: any) { showToast(e?.response?.data?.error || 'Failed to add member') }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteProject(confirmDelete.projectId)
      showToast('Project deleted — pending requests auto-denied', 'success')
      await fetchProjects()
    } catch { showToast('Delete failed') }
    setConfirmDelete(null)
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (step === 'list') {
    return (
      <div className="view-section active">
        <header className="top-nav">
          <div className="top-nav-left">
            <button className="mobile-menu-btn" onClick={onToggleSidebar}><Navigation24Regular /></button>
            <button className="btn-top-nav">
              <span className="icon" style={{ display: 'flex' }}><FolderOpen24Regular fontSize={18} /></span>
              Projects
            </button>
          </div>
          <div className="top-nav-right">
            <button className="btn-ghost" onClick={openCreateWizard} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Add24Regular fontSize={16} /> New Project
            </button>
          </div>
        </header>

        <div className="content-scroll">
          <div className="hero-banner">
            <div className="hero-left">
              <div className="date-block highlight-badge"><div className="date-num lg-num">{projects.length}</div></div>
              <div className="hero-icon"><FolderOpen24Regular style={{ fontSize: 42 }} /></div>
              <div className="greeting-block"><h1>Project Management</h1><p>Group EC2 instances into projects and assign access</p></div>
            </div>
            <div className="hero-right">
              <button className="btn-ghost" onClick={fetchProjects} disabled={loading}>
                {loading ? 'Loading...' : <><ArrowClockwise20Regular style={{ marginRight: 6, verticalAlign: 'middle' }} />Refresh</>}
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Project</th><th>Account</th><th>Instances</th><th>Members</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.projectId} className="instance-row">
                    <td className="name-cell" style={{ fontWeight: 600 }}>{p.name}</td>
                    <td className="id-cell">{p.accountId}</td>
                    <td className="id-cell">{p.instanceIds?.length ?? 0}</td>
                    <td className="id-cell">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <People24Regular fontSize={14} /> {p.memberCount ?? 0}
                      </span>
                    </td>
                    <td className="id-cell">{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
                    <td className="action-cell">
                      <button className="btn-action" onClick={() => openDetail(p)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <People24Regular fontSize={14} /> Members
                      </button>
                      <button className="btn-icon-action" title="Delete project" style={{ color: 'var(--status-stopped)' }} onClick={() => setConfirmDelete(p)}>
                        <Delete24Regular fontSize={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && !loading && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No projects yet — click "New Project" to create one
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Members detail modal */}
        {detailProject && (
          <div className="modal">
            <div className="modal-card" style={{ width: 520 }}>
              <div className="modal-header">
                <span className="modal-icon"><People24Regular style={{ fontSize: 28 }} /></span>
                <div><h2>{detailProject.name}</h2><p className="modal-subtitle">{detailMembers.length} members</p></div>
              </div>
              <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto', padding: 0 }}>
                {/* Current members */}
                {detailMembers.length > 0 && (
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead><tr><th>User</th><th>Role</th><th style={{ width: 80 }}></th></tr></thead>
                    <tbody>
                      {detailMembers.map(m => (
                        <tr key={m.userId} className="instance-row">
                          <td className="name-cell" style={{ fontSize: 13 }}>{m.userName || m.userId}</td>
                          <td>
                            <span style={{ background: m.role === 'admin' ? 'rgba(123,104,238,0.15)' : 'rgba(80,200,120,0.15)', color: m.role === 'admin' ? '#7b68ee' : '#50c878', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                              {m.role}
                            </span>
                          </td>
                          <td className="action-cell">
                            <button className="btn-icon-action" title={m.role === 'admin' ? 'Demote to member' : 'Promote to admin'} style={{ color: '#7b68ee' }} onClick={() => handleDetailToggleRole(m)}>
                              <ArrowSwap24Regular fontSize={15} />
                            </button>
                            <button className="btn-icon-action" title="Remove from project" style={{ color: 'var(--status-stopped)' }} onClick={() => handleDetailRemove(m.userId)}>
                              <Delete24Regular fontSize={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {detailMembers.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No members yet</p>
                )}
                {/* Add member section */}
                {(() => {
                  const assignedIds = new Set(detailMembers.map(m => m.userId))
                  const available = allUsers.filter(u => u.role === 'user' && !assignedIds.has(u.teamsUserId))
                  if (available.length === 0) return null
                  return (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '12px 16px 4px', borderTop: '1px solid var(--border-light)' }}>Add User</div>
                      <table className="data-table" style={{ margin: 0 }}>
                        <tbody>
                          {available.map(u => (
                            <tr key={u.teamsUserId} className="instance-row">
                              <td className="name-cell" style={{ fontSize: 13 }}>
                                <div>{u.displayName}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                              </td>
                              <td className="action-cell">
                                <button className="btn-action btn-action-success" style={{ fontSize: 12 }} onClick={() => handleDetailAddMember(u.teamsUserId, 'member')}>
                                  <Add24Regular fontSize={13} style={{ marginRight: 3 }} />Member
                                </button>
                                <button className="btn-action" style={{ fontSize: 12, color: '#7b68ee', borderColor: 'rgba(123,104,238,0.3)' }} onClick={() => handleDetailAddMember(u.teamsUserId, 'admin')}>
                                  <Add24Regular fontSize={13} style={{ marginRight: 3 }} />Admin
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )
                })()}
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => { setDetailProject(null); setDetailMembers([]) }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {confirmDelete && (
          <ConfirmDialog
            title="Delete project"
            message={`Delete "${confirmDelete.name}"? All pending requests will be auto-denied and members will lose access.`}
            confirmLabel="Delete"
            danger
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    )
  }

  // ── Create wizard: step 1 — pick account ──────────────────────────────────
  if (step === 'create-account') {
    return (
      <div className="view-section active">
        <header className="top-nav">
          <div className="top-nav-left">
            <button className="mobile-menu-btn" onClick={onToggleSidebar}><Navigation24Regular /></button>
            <button className="btn-top-nav" onClick={() => setStep('list')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft24Regular fontSize={16} /> Back
            </button>
          </div>
        </header>
        <div className="content-scroll" style={{ padding: '24px 32px' }}>
          <h2 style={{ marginBottom: 6 }}>New Project — Step 1: Choose AWS Account</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Select which account's instances will be in this project.</p>
          <div style={{ marginBottom: 20 }}>
            <label className="input-label">Project Name *</label>
            <input className="txt-input" style={{ maxWidth: 360 }} value={wizardName} onChange={e => setWizardName(e.target.value)} placeholder="e.g. Customer A Production" />
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Account</th><th>Regions</th><th>Project tag</th><th></th></tr></thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.accountId} className="instance-row">
                    <td className="name-cell">
                      <div style={{ fontWeight: 600 }}>{acc.alias}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{acc.accountId}</div>
                    </td>
                    <td className="id-cell">{acc.regions?.join(', ')}</td>
                    <td className="id-cell">{acc.project || '—'}</td>
                    <td>
                      <button className="btn-primary" disabled={!wizardName.trim()} onClick={() => handleSelectAccount(acc)}>
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No accounts added yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    )
  }

  // ── Create wizard: step 2 — pick instances ────────────────────────────────
  if (step === 'create-instances') {
    return (
      <div className="view-section active">
        <header className="top-nav">
          <div className="top-nav-left">
            <button className="mobile-menu-btn" onClick={onToggleSidebar}><Navigation24Regular /></button>
            <button className="btn-top-nav" onClick={() => setStep('create-account')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft24Regular fontSize={16} /> Back
            </button>
          </div>
          <div className="top-nav-right">
            <button className="btn-primary" disabled={selectedInstanceIds.size === 0} onClick={() => setStep('create-members')}>
              Next: Add Members ({selectedInstanceIds.size} selected)
            </button>
          </div>
        </header>
        <div className="content-scroll" style={{ padding: '24px 32px' }}>
          <h2 style={{ marginBottom: 6 }}>Step 2: Select EC2 Instances</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            Account: <strong>{wizardAccount?.alias}</strong> — tick instances to include in <strong>{wizardName}</strong>.
          </p>
          {loadingInstances
            ? <p style={{ color: 'var(--text-muted)' }}>Loading instances...</p>
            : (
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th style={{ width: 40 }}></th><th>Name</th><th>Instance ID</th><th>Region</th><th>State</th></tr></thead>
                  <tbody>
                    {accountInstances.map(inst => (
                      <tr key={inst.instanceId} className="instance-row" style={{ cursor: 'pointer' }} onClick={() => toggleInstance(inst.instanceId)}>
                        <td>
                          <input type="checkbox" readOnly checked={selectedInstanceIds.has(inst.instanceId)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td className="name-cell"><Server24Regular fontSize={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />{inst.name || inst.instanceId}</td>
                        <td className="id-cell">{inst.instanceId}</td>
                        <td className="id-cell">{inst.region}</td>
                        <td><div className="status-badge"><span className={`status-dot dot-${inst.state === 'running' ? 'running' : 'stopped'}`} />{inst.state}</div></td>
                      </tr>
                    ))}
                    {accountInstances.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                        No instances with <code>Restartable=true</code> tag found in this account
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    )
  }

  // ── Create wizard: step 3 — assign members ────────────────────────────────
  return (
    <div className="view-section active">
      <header className="top-nav">
        <div className="top-nav-left">
          <button className="mobile-menu-btn" onClick={onToggleSidebar}><Navigation24Regular /></button>
          <button className="btn-top-nav" onClick={() => setStep('create-instances')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft24Regular fontSize={16} /> Back
          </button>
        </div>
        <div className="top-nav-right">
          <button className="btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? 'Creating...' : <><CheckmarkCircle24Regular fontSize={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />Create Project</>}
          </button>
        </div>
      </header>
      <div className="content-scroll" style={{ padding: '24px 32px' }}>
        <h2 style={{ marginBottom: 6 }}>Step 3: Assign Members</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          Project: <strong>{wizardName}</strong> — {selectedInstanceIds.size} instance(s). Click a role to assign.
        </p>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Global Role</th>
                <th style={{ textAlign: 'center' }}>Project Admin</th>
                <th style={{ textAlign: 'center' }}>Member</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.filter(u => u.role === 'user').map(u => (
                <tr key={u.teamsUserId} className="instance-row">
                  <td className="name-cell">
                    <div style={{ fontWeight: 500 }}>{u.displayName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                  </td>
                  <td className="id-cell">{u.role}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={projectAdmins.has(u.teamsUserId)} onChange={() => toggleAdmin(u.teamsUserId)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={projectMembers.has(u.teamsUserId) && !projectAdmins.has(u.teamsUserId)} disabled={projectAdmins.has(u.teamsUserId)} onChange={() => toggleMember(u.teamsUserId)} style={{ cursor: 'pointer' }} />
                  </td>
                </tr>
              ))}
              {allUsers.filter(u => u.role === 'user').length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          Project Admin: can approve/deny requests and add members. Member: can view and submit requests.
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
