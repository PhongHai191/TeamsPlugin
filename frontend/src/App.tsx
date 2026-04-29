import { useEffect, useState } from 'react'
import { useTeamsAuth } from './hooks/useTeamsAuth'
import { AdminDashboard } from './pages/AdminDashboard'
import { EmployeeDashboard } from './pages/EmployeeDashboard'
import { UserManagement } from './pages/UserManagement'
import { BlackoutWindows } from './pages/BlackoutWindows'
import { AccountManagement } from './pages/AccountManagement'
import { ProjectManagement } from './pages/ProjectManagement'
import { ProjectAdminDashboard } from './pages/ProjectAdminDashboard'
import { listAllRequests, listMyProjects } from './lib/api'
import type { Project } from './types'
import {
  Server24Regular,
  Clipboard24Regular,
  People24Regular,
  Clock24Regular,
  Cloud24Regular,
  FolderOpen24Regular,
  ShieldCheckmark24Filled,
  Dismiss24Regular
} from '@fluentui/react-icons'

export type View = 'ec2' | 'requests' | 'users' | 'blackout' | 'accounts' | 'projects' | 'my-projects'

const ROLE_COLORS: Record<string, string> = {
  root: '#f5a623',
  admin: '#7b68ee',
  user: '#50c878',
}

export default function App() {
  const { user, loading, error, isDevMode, setDevRole } = useTeamsAuth()
  const [currentView, setCurrentView] = useState<View>('ec2')
  const [pendingCount, setPendingCount] = useState(0)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [myAdminProjects, setMyAdminProjects] = useState<Project[]>([])

  const isPrivileged = user?.role === 'admin' || user?.role === 'root'
  const isUser = user?.role === 'user'

  useEffect(() => {
    if (!isPrivileged) return
    const fetchPending = async () => {
      try {
        const reqs = await listAllRequests('pending')
        setPendingCount(reqs.length)
      } catch { /* ignore */ }
    }
    fetchPending()
    const timer = setInterval(fetchPending, 30000)
    return () => clearInterval(timer)
  }, [isPrivileged])

  // Check if user role is user and is a project admin in any project
  useEffect(() => {
    if (!isUser) return
    listMyProjects().then(ps => setMyAdminProjects(ps)).catch(() => {})
  }, [isUser])

  const isProjectAdmin = isUser && myAdminProjects.length > 0

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)
  const closeSidebar = () => setIsSidebarOpen(false)

  if (loading) return <div style={{ padding: '40px', color: '#a0a0a0', textAlign: 'center' }}>Loading Teams App...</div>
  if (error) return <div style={{ padding: '40px', color: '#ef5350', textAlign: 'center' }}>Auth Error: {error}</div>
  if (!user) return <div style={{ padding: '40px', color: '#a0a0a0', textAlign: 'center' }}>No user data available.</div>

  return (
    <div className="app-container">
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />

      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-box"><ShieldCheckmark24Filled style={{ fontSize: 18 }} /></div>
          <span className="app-name">DevOps Center</span>
          <button className="mobile-menu-btn" onClick={closeSidebar} style={{ marginLeft: 'auto', marginRight: 0 }}>
            <Dismiss24Regular />
          </button>
        </div>

        {isDevMode && (
          <div style={{ padding: '8px 12px 4px' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demo Role</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['user', 'admin', 'root'] as const).map(r => (
                <button key={r} onClick={() => setDevRole(r)} style={{
                  flex: 1, padding: '3px 0', fontSize: 11,
                  fontWeight: user?.role === r ? 700 : 400,
                  border: `1px solid ${ROLE_COLORS[r]}`, borderRadius: 4,
                  background: user?.role === r ? ROLE_COLORS[r] : 'transparent',
                  color: user?.role === r ? '#fff' : ROLE_COLORS[r],
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className="sidebar-nav">
          <a className={`nav-item ${currentView === 'ec2' ? 'active' : ''}`} href="#"
            onClick={(e) => { e.preventDefault(); setCurrentView('ec2'); closeSidebar() }}>
            <div className="nav-indicator"></div>
            <span className="nav-icon"><Server24Regular /></span>
            <span className="nav-text">EC2 Servers</span>
          </a>

          <a className={`nav-item ${currentView === 'requests' ? 'active' : ''}`} href="#"
            onClick={(e) => { e.preventDefault(); setCurrentView('requests'); closeSidebar() }}>
            <div className="nav-indicator"></div>
            <span className="nav-icon"><Clipboard24Regular /></span>
            <span className="nav-text">{isPrivileged ? 'Requests Queue' : 'My Requests'}</span>
            {isPrivileged && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </a>

          {/* Project admin nav (for users who are project admins) */}
          {isProjectAdmin && (
            <>
              <div className="nav-divider"></div>
              <a className={`nav-item ${currentView === 'my-projects' ? 'active' : ''}`} href="#"
                onClick={(e) => { e.preventDefault(); setCurrentView('my-projects'); closeSidebar() }}>
                <div className="nav-indicator"></div>
                <span className="nav-icon"><FolderOpen24Regular /></span>
                <span className="nav-text">My Projects</span>
              </a>
            </>
          )}

          {isPrivileged && (
            <>
              <div className="nav-divider"></div>
              <a className={`nav-item ${currentView === 'users' ? 'active' : ''}`} href="#"
                onClick={(e) => { e.preventDefault(); setCurrentView('users'); closeSidebar() }}>
                <div className="nav-indicator"></div>
                <span className="nav-icon"><People24Regular /></span>
                <span className="nav-text">User Management</span>
              </a>
              <a className={`nav-item ${currentView === 'projects' ? 'active' : ''}`} href="#"
                onClick={(e) => { e.preventDefault(); setCurrentView('projects'); closeSidebar() }}>
                <div className="nav-indicator"></div>
                <span className="nav-icon"><FolderOpen24Regular /></span>
                <span className="nav-text">Projects</span>
              </a>
            </>
          )}

          {user?.role === 'root' && (
            <>
              <div className="nav-divider"></div>
              <a className={`nav-item ${currentView === 'accounts' ? 'active' : ''}`} href="#"
                onClick={(e) => { e.preventDefault(); setCurrentView('accounts'); closeSidebar() }}>
                <div className="nav-indicator"></div>
                <span className="nav-icon"><Cloud24Regular /></span>
                <span className="nav-text">AWS Accounts</span>
              </a>
              <a className={`nav-item ${currentView === 'blackout' ? 'active' : ''}`} href="#"
                onClick={(e) => { e.preventDefault(); setCurrentView('blackout'); closeSidebar() }}>
                <div className="nav-indicator"></div>
                <span className="nav-icon"><Clock24Regular /></span>
                <span className="nav-text">Blackout Windows</span>
              </a>
            </>
          )}
        </nav>
      </aside>

      <main className="main-content">
        {isPrivileged ? (
          <>
            {(currentView === 'ec2' || currentView === 'requests') && <AdminDashboard user={user} view={currentView} onToggleSidebar={toggleSidebar} />}
            {currentView === 'users' && <UserManagement callerRole={user.role} onToggleSidebar={toggleSidebar} />}
            {currentView === 'projects' && <ProjectManagement onToggleSidebar={toggleSidebar} />}
            {currentView === 'accounts' && user.role === 'root' && <AccountManagement onToggleSidebar={toggleSidebar} />}
            {currentView === 'blackout' && user.role === 'root' && <BlackoutWindows onToggleSidebar={toggleSidebar} />}
          </>
        ) : (
          <>
            {currentView === 'ec2' && <EmployeeDashboard user={user} view="ec2" onToggleSidebar={toggleSidebar} />}
            {currentView === 'requests' && <EmployeeDashboard user={user} view="requests" onToggleSidebar={toggleSidebar} />}
            {currentView === 'my-projects' && <ProjectAdminDashboard user={user} onToggleSidebar={toggleSidebar} />}
          </>
        )}
      </main>
    </div>
  )
}
