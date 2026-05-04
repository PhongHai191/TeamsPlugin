import { useEffect, useState } from 'react'
import { useTeamsAuth } from './hooks/useTeamsAuth'
import { UserManagement } from './pages/UserManagement'
import { BlackoutWindows } from './pages/BlackoutWindows'
import { AccountManagement } from './pages/AccountManagement'
import { ProjectManagement } from './pages/ProjectManagement'
import { ProjectWorkspace } from './pages/ProjectWorkspace'
import { listMyProjects, listAllRequests } from './lib/api'
import type { Project } from './types'
import {
  People24Regular,
  Clock24Regular,
  Cloud24Regular,
  FolderOpen24Regular,
  ShieldCheckmark24Filled,
  Dismiss24Regular,
  FolderAdd24Regular,
} from '@fluentui/react-icons'

type GlobalView = 'users' | 'projects' | 'accounts' | 'blackout'

const ROLE_COLORS: Record<string, string> = {
  root: '#f5a623',
  admin: '#7b68ee',
  user: '#50c878',
}

export default function App() {
  const { user, loading, error, isDevMode, setDevRole } = useTeamsAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [globalView, setGlobalView] = useState<GlobalView | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const isPrivileged = user?.role === 'admin' || user?.role === 'root'

  // Fetch projects once user is loaded
  useEffect(() => {
    if (!user) return
    listMyProjects().then(ps => {
      setProjects(ps)
      if (ps.length > 0) {
        setSelectedProjectId(ps[0].projectId)
      }
    }).catch(() => {})
  }, [user])

  // Pending badge count for admin/root
  useEffect(() => {
    if (!isPrivileged) return
    const fetch = async () => {
      try {
        const reqs = await listAllRequests('pending')
        setPendingCount(reqs.length)
      } catch { /* ignore */ }
    }
    fetch()
    const t = setInterval(fetch, 30000)
    return () => clearInterval(t)
  }, [isPrivileged])

  const selectedProject = projects.find(p => p.projectId === selectedProjectId) ?? null

  const selectProject = (id: string) => {
    setSelectedProjectId(id)
    setGlobalView(null)
    setIsSidebarOpen(false)
  }

  const selectGlobalView = (view: GlobalView) => {
    setGlobalView(view)
    setSelectedProjectId(null)
    setIsSidebarOpen(false)
  }

  const toggleSidebar = () => setIsSidebarOpen(s => !s)
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
          {/* Projects section */}
          <div className="nav-section-header">
            <span>My Projects</span>
            {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </div>

          {projects.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No projects available
            </div>
          ) : (
            projects.map(p => (
              <div
                key={p.projectId}
                className={`tree-item ${selectedProjectId === p.projectId ? 'active' : ''}`}
                onClick={() => selectProject(p.projectId)}
              >
                <FolderOpen24Regular style={{ fontSize: 14, flexShrink: 0, opacity: 0.7 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
              </div>
            ))
          )}

          {/* Admin / Root global tools */}
          {isPrivileged && (
            <>
              <div className="nav-divider" />
              <a className={`nav-item ${globalView === 'users' ? 'active' : ''}`} href="#"
                onClick={e => { e.preventDefault(); selectGlobalView('users') }}>
                <div className="nav-indicator" />
                <span className="nav-icon"><People24Regular /></span>
                <span className="nav-text">User Management</span>
              </a>
              <a className={`nav-item ${globalView === 'projects' ? 'active' : ''}`} href="#"
                onClick={e => { e.preventDefault(); selectGlobalView('projects') }}>
                <div className="nav-indicator" />
                <span className="nav-icon"><FolderAdd24Regular /></span>
                <span className="nav-text">Manage Projects</span>
              </a>
            </>
          )}

          {user.role === 'root' && (
            <>
              <div className="nav-divider" />
              <a className={`nav-item ${globalView === 'accounts' ? 'active' : ''}`} href="#"
                onClick={e => { e.preventDefault(); selectGlobalView('accounts') }}>
                <div className="nav-indicator" />
                <span className="nav-icon"><Cloud24Regular /></span>
                <span className="nav-text">AWS Accounts</span>
              </a>
              <a className={`nav-item ${globalView === 'blackout' ? 'active' : ''}`} href="#"
                onClick={e => { e.preventDefault(); selectGlobalView('blackout') }}>
                <div className="nav-indicator" />
                <span className="nav-icon"><Clock24Regular /></span>
                <span className="nav-text">Blackout Windows</span>
              </a>
            </>
          )}
        </nav>
      </aside>

      <main className="main-content">
        {selectedProject ? (
          <ProjectWorkspace
            key={selectedProject.projectId}
            project={selectedProject}
            user={user}
            onToggleSidebar={toggleSidebar}
          />
        ) : globalView === 'users' ? (
          <UserManagement callerRole={user.role} onToggleSidebar={toggleSidebar} />
        ) : globalView === 'projects' ? (
          <ProjectManagement onToggleSidebar={toggleSidebar} />
        ) : globalView === 'accounts' && user.role === 'root' ? (
          <AccountManagement onToggleSidebar={toggleSidebar} />
        ) : globalView === 'blackout' && user.role === 'root' ? (
          <BlackoutWindows onToggleSidebar={toggleSidebar} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12 }}>
            <FolderOpen24Regular style={{ fontSize: 48 }} />
            <p style={{ fontSize: 14 }}>Select a project from the sidebar</p>
          </div>
        )}
      </main>
    </div>
  )
}
