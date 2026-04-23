import { useEffect, useState } from 'react'
import { useTeamsAuth } from './hooks/useTeamsAuth'
import { AdminDashboard } from './pages/AdminDashboard'
import { EmployeeDashboard } from './pages/EmployeeDashboard'
import { UserManagement } from './pages/UserManagement'
import { listAllRequests } from './lib/api'
import {
  Server24Regular,
  Clipboard24Regular,
  People24Regular,
  Cloud24Regular,
  Branch24Regular,
  ShieldCheckmark24Filled
} from '@fluentui/react-icons'

export type View = 'ec2' | 'requests' | 'users'

const ROLE_COLORS: Record<string, string> = {
  root: '#f5a623',
  admin: '#7b68ee',
  user: '#50c878',
}

export default function App() {
  const { user, loading, error, isDevMode, setDevRole } = useTeamsAuth()
  const [currentView, setCurrentView] = useState<View>('ec2')
  const [pendingCount, setPendingCount] = useState(0)

  const isPrivileged = user?.role === 'admin' || user?.role === 'root'

  useEffect(() => {
    if (!isPrivileged) return
    const fetchPending = async () => {
      try {
        const reqs = await listAllRequests('pending')
        setPendingCount(reqs.length)
      } catch (err) {
        console.error('Failed to fetch pending requests', err)
      }
    }
    fetchPending()
    const timer = setInterval(fetchPending, 30000)
    return () => clearInterval(timer)
  }, [isPrivileged])

  console.log('App state:', { loading, error, user: !!user });

  if (loading) {
    return <div style={{ padding: '40px', color: '#a0a0a0', textAlign: 'center' }}>Loading Teams App...</div>
  }

  if (error) {
    return <div style={{ padding: '40px', color: '#ef5350', textAlign: 'center' }}>Auth Error: {error}</div>
  }

  if (!user) {
    return <div style={{ padding: '40px', color: '#a0a0a0', textAlign: 'center' }}>No user data available. Check console.</div>
  }

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-box"><ShieldCheckmark24Filled style={{ fontSize: 18 }} /></div>
          <span className="app-name">DevOps Center</span>
        </div>

        {isDevMode && (
          <div style={{ padding: '8px 12px 4px' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demo Role</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['user', 'admin', 'root'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setDevRole(r)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    fontSize: 11,
                    fontWeight: user?.role === r ? 700 : 400,
                    border: `1px solid ${ROLE_COLORS[r]}`,
                    borderRadius: 4,
                    background: user?.role === r ? ROLE_COLORS[r] : 'transparent',
                    color: user?.role === r ? '#fff' : ROLE_COLORS[r],
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className="sidebar-nav">
          <a 
            className={`nav-item ${currentView === 'ec2' ? 'active' : ''}`} 
            href="#" 
            onClick={(e) => { e.preventDefault(); setCurrentView('ec2') }}
          >
            <div className="nav-indicator"></div>
            <span className="nav-icon"><Server24Regular /></span>
            <span className="nav-text">EC2 Servers</span>
          </a>

          <a 
            className={`nav-item ${currentView === 'requests' ? 'active' : ''}`} 
            href="#" 
            onClick={(e) => { e.preventDefault(); setCurrentView('requests') }}
          >
            <div className="nav-indicator"></div>
            <span className="nav-icon"><Clipboard24Regular /></span>
            <span className="nav-text">{isPrivileged ? 'Requests Queue' : 'My Requests'}</span>
            {isPrivileged && pendingCount > 0 && (
              <span className="badge">{pendingCount}</span>
            )}
          </a>
          
          {isPrivileged && (
            <>
              <div className="nav-divider"></div>
              <a 
                className={`nav-item ${currentView === 'users' ? 'active' : ''}`} 
                href="#" 
                onClick={(e) => { e.preventDefault(); setCurrentView('users') }}
              >
                <div className="nav-indicator"></div>
                <span className="nav-icon"><People24Regular /></span>
                <span className="nav-text">User Management</span>
              </a>
            </>
          )}

          <div className="nav-divider"></div>
          
          <a className="nav-item disabled" href="#">
            <div className="nav-indicator"></div>
            <span className="nav-icon"><Cloud24Regular /></span>
            <span className="nav-text">Cloud Accounts</span>
          </a>
          <a className="nav-item disabled" href="#">
            <div className="nav-indicator"></div>
            <span className="nav-icon"><Branch24Regular /></span>
            <span className="nav-text">Git Repos</span>
          </a>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {isPrivileged
          ? <>
              {(currentView === 'ec2' || currentView === 'requests') && <AdminDashboard user={user} view={currentView} />}
              {currentView === 'users' && <UserManagement callerRole={user.role} />}
            </>
          : <>
              {currentView === 'ec2' && <EmployeeDashboard user={user} view="ec2" />}
              {currentView === 'requests' && <EmployeeDashboard user={user} view="requests" />}
            </>
        }
      </main>
    </div>
  )
}
