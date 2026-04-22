import {
  FluentProvider,
  Spinner,
  Tab,
  TabList,
  Text,
  makeStyles,
  teamsDarkTheme,
  teamsLightTheme,
  tokens,
} from '@fluentui/react-components'
import { useState } from 'react'
import { useTeamsAuth } from './hooks/useTeamsAuth'
import { AdminDashboard } from './pages/AdminDashboard'
import { EmployeeDashboard } from './pages/EmployeeDashboard'
import { UserManagement } from './pages/UserManagement'

const useStyles = makeStyles({
  nav: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: '0 24px',
    background: tokens.colorNeutralBackground1,
  },
})

type AdminTab = 'requests' | 'users'

export default function App() {
  const { user, loading, error } = useTeamsAuth()
  const [tab, setTab] = useState<AdminTab>('requests')
  const styles = useStyles()

  const theme = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? teamsDarkTheme
    : teamsLightTheme

  const isPrivileged = user?.role === 'admin' || user?.role === 'root'

  return (
    <FluentProvider theme={theme} style={{ minHeight: '100vh' }}>
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <Spinner label="Initializing Teams app..." />
        </div>
      )}
      {error && (
        <div style={{ padding: '24px' }}>
          <Text style={{ color: 'red' }}>Authentication error: {error}</Text>
        </div>
      )}
      {user && !isPrivileged && <EmployeeDashboard />}
      {user && isPrivileged && (
        <>
          <div className={styles.nav}>
            <TabList
              selectedValue={tab}
              onTabSelect={(_, d) => setTab(d.value as AdminTab)}
            >
              <Tab value="requests">Restart Requests</Tab>
              <Tab value="users">User Management</Tab>
            </TabList>
          </div>
          {tab === 'requests' && <AdminDashboard user={user} />}
          {tab === 'users' && <UserManagement callerRole={user.role} />}
        </>
      )}
    </FluentProvider>
  )
}
