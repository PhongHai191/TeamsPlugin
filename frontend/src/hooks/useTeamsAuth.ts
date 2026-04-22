import { useEffect, useState } from 'react'
import * as microsoftTeams from '@microsoft/teams-js'
import { setAuthToken } from '../lib/api'
import type { CurrentUser, Role } from '../types'

interface AuthState {
  user: CurrentUser | null
  token: string | null
  loading: boolean
  error: string | null
}

export function useTeamsAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    microsoftTeams.app
      .initialize()
      .then(async () => {
        const context = await microsoftTeams.app.getContext()

        const token = await new Promise<string>((resolve, reject) => {
          microsoftTeams.authentication.getAuthToken({
            successCallback: resolve,
            failureCallback: reject,
          })
        })

        setAuthToken(token)

        // Decode display name and email from Teams context
        const user: CurrentUser = {
          teamsUserId: context.user?.id ?? '',
          displayName: context.user?.displayName ?? '',
          email: context.user?.loginHint ?? '',
          role: 'user', // backend will confirm actual role
        }

        // Fetch actual role from backend via /requests/me (any authed call)
        // The role is determined server-side; here we store what we get back
        // from the first API response or a dedicated /me endpoint if added later.
        setState({ user, token, loading: false, error: null })
      })
      .catch(err => {
        // Dev fallback: if not running inside Teams, use mock user
        if (import.meta.env.DEV) {
          const mockToken = 'dev-mock-token'
          setAuthToken(mockToken)
          // ?role=admin or ?role=user overrides VITE_DEV_ROLE without restart
          const urlRole = new URLSearchParams(window.location.search).get('role') as Role | null
          const role: Role = urlRole ?? (import.meta.env.VITE_DEV_ROLE as Role) ?? 'user'
          setState({
            user: {
              teamsUserId: 'dev-user-001',
              displayName: 'Dev User',
              email: 'dev@example.com',
              role,
            },
            token: mockToken,
            loading: false,
            error: null,
          })
        } else {
          setState({ user: null, token: null, loading: false, error: String(err) })
        }
      })
  }, [])

  return state
}
