import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  CardHeader,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
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
} from '@fluentui/react-components'
import { ChevronDown20Regular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useQuery } from '../hooks/useQuery'
import { listUsers, updateUserRole } from '../lib/api'
import type { Role, User } from '../types'

const useStyles = makeStyles({
  page: { padding: '24px', maxWidth: '900px', margin: '0 auto' },
  header: { marginBottom: '24px' },
})

const roleBadge: Record<Role, { color: 'important' | 'warning' | 'subtle'; label: string }> = {
  root:  { color: 'important', label: 'Root' },
  admin: { color: 'warning',   label: 'Admin' },
  user:  { color: 'subtle',    label: 'User' },
}

const columns = ['Display Name', 'Email', 'Teams User ID', 'Role', 'Actions']

interface Props {
  callerRole: Role
}

export function UserManagement({ callerRole }: Props) {
  const styles = useStyles()
  const [updating, setUpdating] = useState<string | null>(null)
  const { data: users, loading, error, refetch } = useQuery(listUsers)

  const handleRoleChange = async (user: User, newRole: Role) => {
    setUpdating(user.teamsUserId)
    try {
      await updateUserRole(user.teamsUserId, newRole)
      refetch()
    } finally {
      setUpdating(null)
    }
  }

  // admin sees only users; root sees everyone
  const visible = (users ?? []).filter(u =>
    callerRole === 'root' ? true : u.role === 'user'
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title2>User Management</Title2>
      </div>

      <Card>
        <CardHeader header={<Body1 weight="semibold">Members ({visible.length})</Body1>} />

        {loading && <Spinner label="Loading..." style={{ padding: '24px' }} />}
        {error && <Text style={{ color: 'red', padding: '16px' }}>{error}</Text>}

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
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Caption1>No users found.</Caption1>
                  </TableCell>
                </TableRow>
              )}
              {visible.map((u: User) => {
                const badge = roleBadge[u.role]
                const isUpdating = updating === u.teamsUserId
                return (
                  <TableRow key={u.teamsUserId}>
                    <TableCell>{u.displayName}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Caption1>{u.teamsUserId}</Caption1>
                    </TableCell>
                    <TableCell>
                      <Badge appearance="filled" color={badge.color}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {callerRole === 'root' && u.role !== 'root' && (
                        isUpdating ? (
                          <Spinner size="tiny" />
                        ) : (
                          <Menu>
                            <MenuTrigger disableButtonEnhancement>
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<ChevronDown20Regular />}
                                iconPosition="after"
                              >
                                Change role
                              </Button>
                            </MenuTrigger>
                            <MenuPopover>
                              <MenuList>
                                {u.role !== 'admin' && (
                                  <MenuItem onClick={() => handleRoleChange(u, 'admin')}>
                                    Promote to Admin
                                  </MenuItem>
                                )}
                                {u.role !== 'user' && (
                                  <MenuItem onClick={() => handleRoleChange(u, 'user')}>
                                    Demote to User
                                  </MenuItem>
                                )}
                              </MenuList>
                            </MenuPopover>
                          </Menu>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
