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

export default function App() {
  const { user, loading, error } = useTeamsAuth()
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
        {currentView === 'ec2' && (isPrivileged ? <AdminDashboard user={user} view="ec2" /> : <EmployeeDashboard user={user} view="ec2" />)}
        {currentView === 'requests' && (isPrivileged ? <AdminDashboard user={user} view="requests" /> : <EmployeeDashboard user={user} view="requests" />)}
        {currentView === 'users' && isPrivileged && <UserManagement callerRole={user.role} />}
      </main>
    </div>
  )
}
