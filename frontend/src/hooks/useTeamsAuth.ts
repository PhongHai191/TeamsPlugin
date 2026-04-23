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
    const initTeams = async () => {
      try {
        // Timeout after 2 seconds if not in Teams
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('Teams init timeout'), 2000))
        await Promise.race([microsoftTeams.app.initialize(), timeoutPromise])
        
        const context = await microsoftTeams.app.getContext()
        const token = await new Promise<string>((resolve, reject) => {
          microsoftTeams.authentication.getAuthToken({
            successCallback: resolve,
            failureCallback: reject,
          })
        })

        setAuthToken(token)
        setState({
          user: {
            teamsUserId: context.user?.id ?? '',
            displayName: context.user?.displayName ?? '',
            email: context.user?.loginHint ?? '',
            role: 'user',
          },
          token,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Teams init failed, falling back to mock user:', err)
          const mockToken = 'dev-mock-token'
          setAuthToken(mockToken)
          const urlRole = new URLSearchParams(window.location.search).get('role') as Role | null
          const role: Role = urlRole ?? (import.meta.env.VITE_DEV_ROLE as Role) ?? 'user'
          setState({
            user: {
              teamsUserId: 'dev-user-001',
              displayName: 'Dev User',
              email: 'dev@example.com',
              role,
              totpEnabled: false,
            },
            token: mockToken,
            loading: false,
            error: null,
          })
        } else {
          setState({ user: null, token: null, loading: false, error: String(err) })
        }
      }
    }
    initTeams()
  }, [])

  return state
}
