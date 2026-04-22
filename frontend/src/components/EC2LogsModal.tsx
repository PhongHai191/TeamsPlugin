import {
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components'
import { History20Regular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useQuery } from '../hooks/useQuery'
import { getRebootHistory } from '../lib/api'

interface Props {
  instanceId: string
  instanceName: string
}

export function EC2LogsModal({ instanceId, instanceName }: Props) {
  const [open, setOpen] = useState(false)

  const validId = /^i-[0-9a-f]+$/.test(instanceId)

  const { data: events, loading, error } = useQuery(
    () => validId && open ? getRebootHistory(instanceId) : Promise.resolve([]),
    [open, instanceId],
  )

  return (
    <>
      <Button
        appearance="subtle"
        size="small"
        icon={<History20Regular />}
        onClick={() => setOpen(true)}
      >
        Logs
      </Button>

      <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
        <DialogSurface style={{ minWidth: 560 }}>
          <DialogBody>
            <DialogTitle>
              Reboot History — <Caption1>{instanceName} ({instanceId})</Caption1>
            </DialogTitle>
            <DialogContent>
              {loading && <Spinner label="Fetching CloudTrail events..." style={{ padding: '16px' }} />}
              {error && <Text style={{ color: 'red' }}>{error}</Text>}
              {!loading && !error && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Time</TableHeaderCell>
                      <TableHeaderCell>Triggered by</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(events ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <Caption1>No reboot events found for this instance.</Caption1>
                        </TableCell>
                      </TableRow>
                    )}
                    {(events ?? []).map(e => (
                      <TableRow key={e.eventId}>
                        <TableCell>{new Date(e.eventTime).toLocaleString()}</TableCell>
                        <TableCell>{e.username}</TableCell>
                        <TableCell>
                          <Badge appearance="filled" color="success">Rebooted</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}
