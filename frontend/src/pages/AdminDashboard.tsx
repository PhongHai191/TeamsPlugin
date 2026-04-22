import { useState } from 'react'
import {
  Body1,
  Button,
  Caption1,
  Card,
  CardHeader,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title2,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { CheckmarkCircle20Regular, Dismiss20Regular, ShieldLock20Regular } from '@fluentui/react-icons'
import { ApproveOTPModal } from '../components/ApproveOTPModal'
import { DenyReasonModal } from '../components/DenyReasonModal'
import { EC2LogsModal } from '../components/EC2LogsModal'
import { StatusBadge } from '../components/StatusBadge'
import { TOTPSetupModal } from '../components/TOTPSetupModal'
import { useQuery } from '../hooks/useQuery'
import { denyRequest, listAllRequests } from '../lib/api'
import type { CurrentUser, RestartRequest } from '../types'

const useStyles = makeStyles({
  page: { padding: '24px', maxWidth: '1100px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  actions: { display: 'flex', gap: '8px' },
  filter: { display: 'flex', alignItems: 'center', gap: '8px' },
  pendingCount: {
    background: tokens.colorPaletteYellowBackground2,
    borderRadius: '12px',
    padding: '2px 10px',
    fontSize: '13px',
    fontWeight: 600,
  },
})

const columns = ['Instance', 'Requested By', 'Reason', 'Requested At', 'Status', 'Actions', 'EC2 Logs']

interface Props {
  user: CurrentUser
}

export function AdminDashboard({ user }: Props) {
  const styles = useStyles()
  const [statusFilter, setStatusFilter] = useState('')
  const [denyTarget, setDenyTarget] = useState<string | null>(null)
  const [approveTarget, setApproveTarget] = useState<RestartRequest | null>(null)
  const [totpSetupOpen, setTotpSetupOpen] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(user.totpEnabled ?? false)

  const { data: requests, loading, error, refetch } = useQuery(
    () => listAllRequests(statusFilter),
    [statusFilter],
  )

  const pendingCount = (requests ?? []).filter(r => r.status === 'pending').length

  const handleDenyConfirm = async (reason: string) => {
    if (!denyTarget) return
    await denyRequest(denyTarget, reason)
    setDenyTarget(null)
    refetch()
  }

  return (
    <div className={styles.page}>
      {/* 2FA setup banner */}
      {!totpEnabled && (
        <MessageBar intent="warning" style={{ marginBottom: 16 }}>
          <MessageBarBody>
            Two-factor authentication is not set up. You must enable 2FA to approve restart requests.
            <Button
              appearance="transparent"
              size="small"
              icon={<ShieldLock20Regular />}
              onClick={() => setTotpSetupOpen(true)}
              style={{ marginLeft: 8 }}
            >
              Set up 2FA
            </Button>
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Title2>Admin — Restart Requests</Title2>
          {pendingCount > 0 && (
            <span className={styles.pendingCount}>{pendingCount} pending</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {totpEnabled && (
            <Button
              appearance="subtle"
              size="small"
              icon={<ShieldLock20Regular />}
              onClick={() => setTotpSetupOpen(true)}
            >
              Re-setup 2FA
            </Button>
          )}
          <div className={styles.filter}>
            <Caption1>Filter:</Caption1>
            <Select value={statusFilter} onChange={(_, d) => setStatusFilter(d.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader header={<Body1 weight="semibold">All Requests</Body1>} />

        {loading && <Spinner label="Loading..." style={{ padding: '24px' }} />}
        {error && <Text style={{ padding: '16px', color: 'red' }}>{error}</Text>}

        {!loading && !error && (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(col => (
                  <TableHeaderCell key={col}>{col}</TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Caption1>No requests found.</Caption1>
                  </TableCell>
                </TableRow>
              )}
              {(requests ?? []).map((req: RestartRequest) => (
                <TableRow key={req.requestId}>
                  <TableCell>
                    <Text weight="semibold">{req.instanceName}</Text>
                    <br />
                    <Caption1>{req.instanceId}</Caption1>
                  </TableCell>
                  <TableCell>{req.userName}</TableCell>
                  <TableCell style={{ maxWidth: 240 }}>{req.reason}</TableCell>
                  <TableCell>{new Date(req.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <StatusBadge status={req.status} />
                    {req.status === 'denied' && req.denyReason && (
                      <Caption1 style={{ display: 'block', marginTop: 2 }}>
                        {req.denyReason}
                      </Caption1>
                    )}
                  </TableCell>
                  <TableCell>
                    {req.status === 'pending' && (
                      <div className={styles.actions}>
                        <Button
                          appearance="primary"
                          size="small"
                          icon={<CheckmarkCircle20Regular />}
                          onClick={() => setApproveTarget(req)}
                          disabled={!totpEnabled}
                          title={!totpEnabled ? 'Set up 2FA first' : ''}
                        >
                          Approve
                        </Button>
                        <Button
                          appearance="secondary"
                          size="small"
                          icon={<Dismiss20Regular />}
                          onClick={() => setDenyTarget(req.requestId)}
                        >
                          Deny
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <EC2LogsModal instanceId={req.instanceId} instanceName={req.instanceName} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <DenyReasonModal
        open={denyTarget !== null}
        onClose={() => setDenyTarget(null)}
        onConfirm={handleDenyConfirm}
      />

      <ApproveOTPModal
        open={approveTarget !== null}
        requestId={approveTarget?.requestId ?? ''}
        instanceName={approveTarget?.instanceName ?? ''}
        onClose={() => setApproveTarget(null)}
        onApproved={refetch}
      />

      <TOTPSetupModal
        open={totpSetupOpen}
        onClose={() => setTotpSetupOpen(false)}
        onEnabled={() => setTotpEnabled(true)}
      />
    </div>
  )
}
