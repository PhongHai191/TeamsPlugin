import { Badge } from '@fluentui/react-components'
import type { RequestStatus } from '../types'

const config: Record<RequestStatus, { color: 'warning' | 'success' | 'danger'; label: string }> = {
  pending:  { color: 'warning', label: 'Pending' },
  approved: { color: 'success', label: 'Approved' },
  denied:   { color: 'danger',  label: 'Denied' },
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { color, label } = config[status]
  return (
    <Badge appearance="filled" color={color}>
      {label}
    </Badge>
  )
}
