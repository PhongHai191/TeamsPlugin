import { useState } from 'react'
import {
  Body1,
  Button,
  Caption1,
  Card,
  CardHeader,
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
import { CheckmarkCircle20Regular, Dismiss20Regular } from '@fluentui/react-icons'
import { DenyReasonModal } from '../components/DenyReasonModal'
import { EC2LogsModal } from '../components/EC2LogsModal'
import { StatusBadge } from '../components/StatusBadge'
import { useQuery } from '../hooks/useQuery'
import { approveRequest, denyRequest, listAllRequests } from '../lib/api'
import type { RestartRequest } from '../types'

const useStyles = makeStyles({
  page: { padding: '24px', maxWidth: '1100px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
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

export function AdminDashboard() {
  const styles = useStyles()
  const [statusFilter, setStatusFilter] = useState('')
  const [denyTarget, setDenyTarget] = useState<string | null>(null)

  const { data: requests, loading, error, refetch } = useQuery(
    () => listAllRequests(statusFilter),
    [statusFilter],
  )

  const pendingCount = (requests ?? []).filter(r => r.status === 'pending').length

  const handleApprove = async (req: RestartRequest) => {
    await approveRequest(req.requestId)
    refetch()
  }

  const handleDenyConfirm = async (reason: string) => {
    if (!denyTarget) return
    await denyRequest(denyTarget, reason)
    setDenyTarget(null)
    refetch()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Title2>Admin — Restart Requests</Title2>
          {pendingCount > 0 && (
            <span className={styles.pendingCount}>{pendingCount} pending</span>
          )}
        </div>
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
                  <TableCell colSpan={6}>
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
                          onClick={() => handleApprove(req)}
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
    </div>
  )
}
