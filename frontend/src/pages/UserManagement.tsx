import { useState, useEffect } from 'react'
import { listUsers, updateUserRole } from '../lib/api'
import type { Role, User } from '../types'
import { People24Regular, PeopleTeam24Regular, ArrowClockwise20Regular, Navigation24Regular } from '@fluentui/react-icons'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'

interface Props {
  callerRole: Role
  onToggleSidebar?: () => void
}

export function UserManagement({ callerRole, onToggleSidebar }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirmRole, setConfirmRole] = useState<{ user: User; newRole: Role } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'error') => setToast({ message, type })

  const fetchUsers = async () => {
    setLoading(true)
    try {
      setUsers(await listUsers())
    } catch (e) {
      console.error('Failed to list users', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleRoleChange = (user: User, newRole: Role) => setConfirmRole({ user, newRole })

  const confirmRoleChange = async () => {
    if (!confirmRole) return
    const { user, newRole } = confirmRole
    setConfirmRole(null)
    setUpdating(user.teamsUserId)
    try {
      await updateUserRole(user.teamsUserId, newRole)
      fetchUsers()
      showToast(`Role updated to ${newRole}`, 'success')
    } catch (e: any) {
      showToast('Failed to update role: ' + (e?.response?.data?.error || e.message))
    }
    setUpdating(null)
  }

  // Admin sees only users; root sees everyone
  const visible = users.filter(u => callerRole === 'root' ? true : u.role === 'user')

  return (
    <div className="view-section active">
      <header className="top-nav">
        <div className="top-nav-left">
          <button className="mobile-menu-btn" onClick={onToggleSidebar}>
            <Navigation24Regular />
          </button>
          <button className="btn-top-nav"><span className="icon" style={{ display: 'flex' }}><People24Regular fontSize={18} /></span> Directory</button>
        </div>
      </header>

      <div className="content-scroll">
        <div className="hero-banner">
          <div className="hero-left">
            <div className="hero-icon"><PeopleTeam24Regular style={{ fontSize: 42 }} /></div>
            <div className="greeting-block">
              <h1>User Management</h1>
              <p>Manage access roles for the DevOps Center</p>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-status-text">{visible.length} users visible</div>
            <button className="btn-ghost" onClick={fetchUsers} disabled={loading}>
              {loading ? 'Loading...' : <><ArrowClockwise20Regular style={{ marginRight: 6, verticalAlign: 'middle', marginBottom: 2 }} /> Refresh</>}
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Email</th>
                <th>Teams User ID</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(u => {
                const isUpdating = updating === u.teamsUserId
                return (
                  <tr key={u.teamsUserId} className="instance-row">
                    <td className="name-cell">{u.displayName}</td>
                    <td>{u.email}</td>
                    <td className="id-cell">{u.teamsUserId}</td>
                    <td>
                      <span className="type-badge" style={{
                        background: u.role === 'root' ? 'rgba(224, 108, 108, 0.1)' : u.role === 'admin' ? 'rgba(245, 166, 35, 0.1)' : 'var(--bg-active)',
                        color: u.role === 'root' ? 'var(--status-stopped)' : u.role === 'admin' ? 'var(--status-pending)' : 'var(--text-secondary)',
                        borderColor: u.role === 'root' ? 'rgba(224, 108, 108, 0.3)' : u.role === 'admin' ? 'rgba(245, 166, 35, 0.3)' : 'var(--border-light)'
                      }}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="action-cell">
                      {callerRole === 'root' && u.role !== 'root' && (
                        isUpdating ? <span className="no-action">Updating...</span> : (
                          <>
                            {u.role !== 'admin' && (
                              <button className="btn-action" onClick={() => handleRoleChange(u, 'admin')}>Promote to Admin</button>
                            )}
                            {u.role !== 'user' && (
                              <button className="btn-action btn-danger-outline" onClick={() => handleRoleChange(u, 'user')}>Demote to User</button>
                            )}
                          </>
                        )
                      )}
                      {(callerRole !== 'root' || u.role === 'root') && <span className="no-action">—</span>}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {confirmRole && (
        <ConfirmDialog
          title="Change user role"
          message={`Change role of ${confirmRole.user.displayName} to "${confirmRole.newRole}"?`}
          confirmLabel="Change"
          onConfirm={confirmRoleChange}
          onCancel={() => setConfirmRole(null)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
