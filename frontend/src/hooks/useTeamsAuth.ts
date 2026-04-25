import { useEffect, useState } from 'react'
import * as microsoftTeams from '@microsoft/teams-js'
import { getMe, setAuthToken } from '../lib/api'
import type { CurrentUser, Role } from '../types'

interface AuthState {
  user: CurrentUser | null
  token: string | null
  loading: boolean
  error: string | null
  isDevMode: boolean
  setDevRole: (role: Role) => void
}

export function useTeamsAuth(): AuthState {
  const [state, setState] = useState<Omit<AuthState, 'setDevRole'>>({
    user: null,
    token: null,
    loading: true,
    error: null,
    isDevMode: false,
  })

  const setDevRole = (role: Role) => {
    const url = new URL(window.location.href)
    url.searchParams.set('role', role)
    window.history.replaceState({}, '', url.toString())
    const newToken = `dev-mock-token-${role}`
    setAuthToken(newToken)
    setState(prev => prev.user
      ? { ...prev, token: newToken, user: { ...prev.user, role, teamsUserId: `dev-user-${role}`, email: `${role}@example.com`, displayName: `Demo (${role})` } }
      : prev
    )
  }

  useEffect(() => {
    const initTeams = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject('Teams init timeout'), 2000))
        await Promise.race([microsoftTeams.app.initialize(), timeoutPromise])

        await microsoftTeams.app.getContext()
        const token = await new Promise<string>((resolve, reject) => {
          microsoftTeams.authentication.getAuthToken({
            successCallback: resolve,
            failureCallback: reject,
          })
        })

        setAuthToken(token)
        const me = await getMe()
        setState({
          user: {
            teamsUserId: me.teamsUserId,
            displayName: me.displayName,
            email: me.email,
            role: me.role,
          },
          token,
          loading: false,
          error: null,
          isDevMode: false,
        })
      } catch (err) {
        console.warn('Teams init failed, falling back to mock user:', err)
        const params = new URLSearchParams(window.location.search)
        const role: Role = (params.get('role') as Role) ?? (import.meta.env.VITE_DEV_ROLE as Role) ?? 'user'
        const mockToken = `dev-mock-token-${role}`
        setAuthToken(mockToken)

        setState({
          user: {
            teamsUserId: `dev-user-${role}`,
            displayName: `Demo (${role})`,
            email: `${role}@example.com`,
            role,
            totpEnabled: false,
          },
          token: mockToken,
          loading: false,
          error: null,
          isDevMode: true,
        })
      }
    }
    initTeams()
  }, [])

  return { ...state, setDevRole }
}
