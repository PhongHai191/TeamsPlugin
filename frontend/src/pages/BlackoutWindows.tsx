import { useState, useEffect } from 'react'
import {
  listBlackoutWindows, createBlackoutWindow, updateBlackoutWindow,
  deleteBlackoutWindow, toggleBlackoutWindow,
} from '../lib/api'
import type { BlackoutWindow } from '../types'
import {
  Clock24Regular, Add24Regular, Delete24Regular, Edit24Regular,
  Navigation24Regular, CheckmarkCircle24Regular, DismissCircle24Regular,
} from '@fluentui/react-icons'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
]

interface Props {
  onToggleSidebar?: () => void
}

interface FormState {
  name: string
  startTime: string
  endTime: string
  timezone: string
  daysOfWeek: string[]
  scope: string
  reason: string
}

const emptyForm = (): FormState => ({
  name: '',
  startTime: '08:00',
  endTime: '18:00',
  timezone: 'Asia/Ho_Chi_Minh',
  daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  scope: 'all',
  reason: '',
})

export function BlackoutWindows({ onToggleSidebar }: Props) {
  const [windows, setWindows] = useState<BlackoutWindow[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<BlackoutWindow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  const fetch = async () => {
    setLoading(true)
    try { setWindows(await listBlackoutWindows()) } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  const openCreate = () => {
    setEditTarget(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (w: BlackoutWindow) => {
    setEditTarget(w)
    setForm({
      name: w.name,
      startTime: w.startTime,
      endTime: w.endTime,
      timezone: w.timezone,
      daysOfWeek: w.daysOfWeek,
      scope: w.scope || 'all',
      reason: w.reason || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editTarget) {
        await updateBlackoutWindow(editTarget.windowId, form)
      } else {
        await createBlackoutWindow(form)
      }
      setModalOpen(false)
      await fetch()
    } catch (e: any) {
      alert('Save failed: ' + (e?.response?.data?.error || e.message))
    }
    setSaving(false)
  }

  const handleDelete = async (w: BlackoutWindow) => {
    if (!confirm(`Delete blackout window "${w.name}"?`)) return
    try { await deleteBlackoutWindow(w.windowId); await fetch() }
    catch { alert('Delete failed') }
  }

  const handleToggle = async (w: BlackoutWindow) => {
    try { await toggleBlackoutWindow(w.windowId, !w.active); await fetch() }
    catch { alert('Toggle failed') }
  }

  const toggleDay = (day: string) => {
    setForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter(d => d !== day)
        : [...f.daysOfWeek, day],
    }))
  }

  return (
    <div className="view-section active">
      <header className="top-nav">
        <div className="top-nav-left">
          <button className="mobile-menu-btn" onClick={onToggleSidebar}>
            <Navigation24Regular />
          </button>
          <button className="btn-top-nav">
            <span className="icon" style={{ display: 'flex' }}><Clock24Regular fontSize={18} /></span>
            Blackout Windows
          </button>
        </div>
        <div className="top-nav-right">
          <button className="btn-ghost" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Add24Regular fontSize={16} /> Add Window
          </button>
        </div>
      </header>

      <div className="content-scroll">
        <div className="hero-banner">
          <div className="hero-left">
            <div className="date-block highlight-badge">
              <div className="date-num lg-num">{windows.filter(w => w.active).length}</div>
            </div>
            <div className="hero-icon"><Clock24Regular style={{ fontSize: 42 }} /></div>
            <div className="greeting-block">
              <h1>Blackout Windows</h1>
              <p>Block operations during high-risk time periods</p>
            </div>
          </div>
          <div className="hero-right">
            <button className="btn-ghost" onClick={fetch} disabled={loading}>
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Schedule</th>
                <th>Scope</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {windows.map(w => (
                <tr key={w.windowId} className="instance-row">
                  <td className="name-cell" style={{ fontWeight: 600 }}>{w.name}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{w.startTime} – {w.endTime}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{w.daysOfWeek.join(', ')}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{w.timezone}</div>
                  </td>
                  <td className="id-cell">
                    <span className="op-badge op-reboot" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                      {w.scope || 'all'}
                    </span>
                  </td>
                  <td style={{ maxWidth: 200, fontSize: 13, color: w.reason ? 'inherit' : 'var(--text-muted)' }}>{w.reason || '—'}</td>
                  <td>
                    <div className="status-badge">
                      {w.active
                        ? <><span className="status-dot dot-running" /><CheckmarkCircle24Regular fontSize={13} style={{ color: 'var(--status-running)', marginRight: 3 }} />Active</>
                        : <><span className="status-dot dot-stopped" /><DismissCircle24Regular fontSize={13} style={{ color: 'var(--status-stopped)', marginRight: 3 }} />Inactive</>}
                    </div>
                  </td>
                  <td className="action-cell">
                    <button className="btn-action" onClick={() => handleToggle(w)} style={{ fontSize: 12 }}>
                      {w.active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn-icon-action" title="Edit" onClick={() => openEdit(w)}>
                      <Edit24Regular fontSize={16} />
                    </button>
                    <button className="btn-icon-action" title="Delete" style={{ color: 'var(--status-stopped)' }} onClick={() => handleDelete(w)}>
                      <Delete24Regular fontSize={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {windows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No blackout windows configured
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal">
          <div className="modal-card" style={{ width: 520 }}>
            <div className="modal-header">
              <span className="modal-icon"><Clock24Regular style={{ fontSize: 28 }} /></span>
              <div>
                <h2>{editTarget ? 'Edit' : 'New'} Blackout Window</h2>
                <p className="modal-subtitle">Block operations during specified hours</p>
              </div>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="input-label">Name *</label>
                <input className="txt-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Peak Hours - No Prod Changes" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="input-label">Start Time *</label>
                  <input className="txt-input" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="input-label">End Time *</label>
                  <input className="txt-input" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="input-label">Timezone *</label>
                <select className="txt-input" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Days of Week *</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {DAYS.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        border: '1px solid var(--border-light)',
                        background: form.daysOfWeek.includes(d) ? 'var(--accent)' : 'var(--bg-elevated)',
                        color: form.daysOfWeek.includes(d) ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="input-label">Scope</label>
                <input className="txt-input" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}
                  placeholder='all | project:CustomerA | operation:stop | operation:stop,reboot' />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  "all" blocks everything. "project:X" targets a project. "operation:stop" targets specific ops.
                </div>
              </div>
              <div>
                <label className="input-label">Reason</label>
                <input className="txt-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder='e.g. Peak traffic — risk of revenue impact' />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving || !form.name || form.daysOfWeek.length === 0} onClick={handleSave}>
                {saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Create Window'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
