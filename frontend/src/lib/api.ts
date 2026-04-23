import axios from 'axios'
import type { EC2Instance, RestartRequest, Role, User } from '../types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api',
})

export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

// EC2
export const listInstances = (): Promise<EC2Instance[]> =>
  api.get('/ec2/instances').then(r => r.data)

// Employee requests
export const createRequest = (payload: {
  instanceId: string
  instanceName: string
  reason: string
  region: string
}): Promise<RestartRequest> =>
  api.post('/requests', payload).then(r => r.data)

export const listMyRequests = (): Promise<RestartRequest[]> =>
  api.get('/requests/me').then(r => r.data)

// Admin
export const listAllRequests = (status?: string): Promise<RestartRequest[]> =>
  api.get('/admin/requests', { params: status ? { status } : {} }).then(r => r.data)

export const approveRequest = (requestId: string): Promise<void> =>
  api.post('/admin/requests/approve', { requestId }).then(r => r.data)

export const denyRequest = (requestId: string, denyReason: string): Promise<void> =>
  api.post('/admin/requests/deny', { requestId, denyReason }).then(r => r.data)

export const getRebootHistory = (instanceId: string): Promise<RestartRequest[]> =>
  api.get(`/admin/ec2/${instanceId}/reboot-history`).then(r => r.data)

export const listUsers = (): Promise<User[]> =>
  api.get('/admin/users').then(r => r.data)

export const updateUserRole = (teamsUserId: string, role: Role): Promise<void> =>
  api.post('/root/users/role', { teamsUserId, role }).then(r => r.data)

// MFA Number Matching
export const createMFAChallenge = (requestId: string): Promise<{ challengeId: string; displayNumber: number }> =>
  api.post('/admin/mfa/challenge', { requestId }).then(r => r.data)

export const pollMFAChallengeStatus = (challengeId: string): Promise<{ status: string; errorMessage?: string }> =>
  api.get(`/admin/mfa/challenge/${challengeId}/status`).then(r => r.data)

export const getMFAPending = (): Promise<{
  pending: boolean
  challengeId?: string
  options?: number[]
  instanceName?: string
  requestedBy?: string
}> => api.get('/admin/mfa/pending').then(r => r.data)

export const verifyMFAChallenge = (challengeId: string, selectedNumber: number): Promise<void> =>
  api.post(`/admin/mfa/challenge/${challengeId}/verify`, { selectedNumber }).then(r => r.data)

// TOTP
export const getTOTPSetup = (): Promise<{ otpauthUrl: string; secret: string }> =>
  api.get('/admin/totp/setup').then(r => r.data)

export const verifyTOTPSetup = (code: string): Promise<void> =>
  api.post('/admin/totp/verify-setup', { code }).then(r => r.data)

export const resetTOTP = (): Promise<void> =>
  api.post('/admin/totp/reset').then(r => r.data)

export const approveRequestWithOTP = (requestId: string, totpCode: string): Promise<void> =>
  api.post('/admin/requests/approve', { requestId, totpCode }).then(r => r.data)
