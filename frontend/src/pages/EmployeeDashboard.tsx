import { useState, useEffect } from 'react'
import { listInstances, listMyRequests, createRequest } from '../lib/api'
import type { CurrentUser, EC2Instance, OperationType, RestartRequest } from '../types'
import {
  Server24Regular,
  Clipboard24Regular,
  WeatherPartlyCloudyDay24Regular,
  MailInbox24Regular,
  ArrowClockwise20Regular,
  Navigation24Regular,
  Power24Regular,
  Play24Regular
} from '@fluentui/react-icons'

interface Props {
  user: CurrentUser
  view: 'ec2' | 'requests'
  onToggleSidebar?: () => void
}

export function EmployeeDashboard({ user, view, onToggleSidebar }: Props) {
  const [instances, setInstances] = useState<EC2Instance[]>([])
  const [requests, setRequests] = useState<RestartRequest[]>([])
  const [ec2Filter, setEc2Filter] = useState('all')
  const [reqFilter, setReqFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const fetchInstances = async () => {
    setLoading(true)
    try {
      const data = await listInstances()
      setInstances(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const data = await listMyRequests()
      setRequests(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (view === 'ec2') fetchInstances()
    if (view === 'requests') fetchRequests()
  }, [view])

  const handleRequestOperation = async (inst: EC2Instance, operation: OperationType) => {
    const label = operation.charAt(0).toUpperCase() + operation.slice(1)
    const reason = window.prompt(`Submit ${label} request for ${inst.name}?\nReason:`)
    if (!reason) return
    try {
      await createRequest({
        instanceId: inst.instanceId,
        instanceName: inst.name,
        reason,
        region: inst.region,
        operation,
        project: inst.project,
        accountId: inst.accountId,
      })
      alert(`${label} request submitted successfully`)
      fetchRequests()
    } catch (e: any) {
      const msg = e?.response?.data?.error || e.message
      alert(`Failed to submit request: ${msg}`)
    }
  }

  if (view === 'ec2') {
    const filtered = ec2Filter === 'all' ? instances : instances.filter(i => i.state === ec2Filter)
    const running = instances.filter(i => i.state === 'running').length

    return (
      <div className="view-section active">
        <header className="top-nav">
          <div className="top-nav-left">
            <button className="mobile-menu-btn" onClick={onToggleSidebar}>
              <Navigation24Regular />
            </button>
            <button className="btn-top-nav"><span className="icon" style={{ display: 'flex' }}><Server24Regular fontSize={18} /></span> EC2 List</button>
          </div>
        </header>

        <div className="content-scroll">
          <div className="hero-banner">
            <div className="hero-left">
              <div className="date-block">
                <div id="date-num">{new Date().getDate()}</div>
              </div>
              <div className="hero-icon"><WeatherPartlyCloudyDay24Regular style={{ fontSize: 42 }} /></div>
              <div className="greeting-block">
                <h1>Good day, {user.displayName.split(' ')[0]}</h1>
                <p>Welcome to DevOps Center</p>
              </div>
            </div>
            <div className="hero-right">
              <div className="hero-status-text">{instances.length} total, {running} running</div>
              <button className="btn-ghost" onClick={fetchInstances} disabled={loading}>
                {loading ? 'Scanning...' : '🔄 Scan'}
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
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-action" onClick={() => handleRequestOperation(inst, 'reboot')}>
                            <ArrowClockwise20Regular fontSize={14} style={{ marginRight: 4 }}/> Reboot
                          </button>
                          <button className="btn-action btn-action-danger" onClick={() => handleRequestOperation(inst, 'stop')}>
                            <Power24Regular fontSize={14} style={{ marginRight: 4 }}/> Stop
                          </button>
                        </div>
                      ) : inst.state === 'stopped' ? (
                        <button className="btn-action btn-action-success" onClick={() => handleRequestOperation(inst, 'start')}>
                          <Play24Regular fontSize={14} style={{ marginRight: 4 }}/> Start
                        </button>
                      ) : <span className="no-action">—</span>}
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
      </div>
    )
  }
// requests view
const filteredReqs = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)

return (
  <div className="view-section active">
    <header className="top-nav">
      <div className="top-nav-left">
        <button className="mobile-menu-btn" onClick={onToggleSidebar}>
          <Navigation24Regular />
        </button>
        <button className="btn-top-nav"><span className="icon" style={{ display: 'flex' }}><Clipboard24Regular fontSize={18} /></span> My Requests</button>
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
              <h1>My Requests</h1>
              <p>Track your infrastructure restart requests</p>
            </div>
          </div>
          <div className="hero-right">
            <button className="btn-ghost" onClick={fetchRequests} disabled={loading}>
              {loading ? 'Refreshing...' : <><ArrowClockwise20Regular style={{ marginRight: 6, verticalAlign: 'middle', marginBottom: 2 }} /> Refresh</>}
            </button>
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
                <th>Target</th>
                <th>Operation</th>
                <th>Reason</th>
                <th>Time</th>
                <th>Status</th>
                <th>Deny Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredReqs.map(req => (
                <tr key={req.requestId} className={`instance-row ${req.status === 'pending' ? 'row-pending' : ''}`}>
                  <td className="name-cell"><span className="server-icon" style={{ verticalAlign: 'middle', display: 'inline-block' }}><Server24Regular fontSize={16} /></span>{req.instanceName}</td>
                  <td><span className={`op-badge op-${req.operation || 'reboot'}`}>{req.operation || 'reboot'}</span></td>
                  <td style={{ maxWidth: 200 }}>{req.reason}</td>
                  <td className="id-cell">{new Date(req.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="status-badge">
                      <span className={`status-dot dot-${req.status === 'approved' ? 'running' : req.status === 'denied' ? 'stopped' : 'pending'}`}></span>
                      {req.status}
                    </div>
                  </td>
                  <td>
                    {req.status === 'denied' && req.denyReason ? <span className="deny-reason">{req.denyReason}</span> : <span className="no-action">—</span>}
                  </td>
                </tr>
              ))}
              {filteredReqs.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No requests found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
