import { FluentProvider, Spinner, Text, teamsDarkTheme, teamsLightTheme } from '@fluentui/react-components'
import { useTeamsAuth } from './hooks/useTeamsAuth'
import { AdminDashboard } from './pages/AdminDashboard'
import { EmployeeDashboard } from './pages/EmployeeDashboard'

export default function App() {
  const { user, loading, error } = useTeamsAuth()

  const theme = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? teamsDarkTheme
    : teamsLightTheme

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
      {user && (
        user.role === 'admin' ? <AdminDashboard /> : <EmployeeDashboard />
      )}
    </FluentProvider>
  )
}
