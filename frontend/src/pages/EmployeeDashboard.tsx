import {
  Body1,
  Caption1,
  Card,
  CardHeader,
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
import { NewRequestModal } from '../components/NewRequestModal'
import { StatusBadge } from '../components/StatusBadge'
import { useQuery } from '../hooks/useQuery'
import { listMyRequests } from '../lib/api'
import type { RestartRequest } from '../types'

const useStyles = makeStyles({
  page: { padding: '24px', maxWidth: '960px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  denyReason: { color: tokens.colorPaletteRedForeground1, fontSize: '12px', marginTop: '2px' },
})

const columns = ['Instance', 'Reason', 'Requested At', 'Status']

export function EmployeeDashboard() {
  const styles = useStyles()
  const { data: requests, loading, error, refetch } = useQuery(listMyRequests)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title2>My Restart Requests</Title2>
        <NewRequestModal onCreated={refetch} />
      </div>

      <Card>
        <CardHeader header={<Body1 weight="semibold">Request History</Body1>} />

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
                  <TableCell colSpan={4}>
                    <Caption1>No requests yet. Click "New Request" to get started.</Caption1>
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
                  <TableCell>{req.reason}</TableCell>
                  <TableCell>{new Date(req.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <StatusBadge status={req.status} />
                    {req.status === 'denied' && req.denyReason && (
                      <div className={styles.denyReason}>Reason: {req.denyReason}</div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
