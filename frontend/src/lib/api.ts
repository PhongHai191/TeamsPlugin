import axios from 'axios'
import type { AccountMember, AWSAccount, BlackoutWindow, EC2Instance, OperationType, RestartRequest, Role, User } from '../types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api',
})

export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

// EC2
export const listInstances = (): Promise<EC2Instance[]> =>
  api.get('/ec2/instances').then(r => r.data || [])

// Employee requests
export const createRequest = (payload: {
  instanceId: string
  instanceName: string
  reason: string
  region: string
  operation?: OperationType
  project?: string
  accountId?: string
}): Promise<RestartRequest> =>
  api.post('/requests', payload).then(r => r.data)

export const listMyRequests = (): Promise<RestartRequest[]> =>
  api.get('/requests/me').then(r => r.data || [])

// Admin
export const listAllRequests = (status?: string): Promise<RestartRequest[]> =>
  api.get('/admin/requests', { params: status ? { status } : {} }).then(r => r.data || [])

export const approveRequest = (requestId: string): Promise<void> =>
  api.post('/admin/requests/approve', { requestId }).then(r => r.data)

export const denyRequest = (requestId: string, denyReason: string): Promise<void> =>
  api.post('/admin/requests/deny', { requestId, denyReason }).then(r => r.data)

export const getRebootHistory = (instanceId: string): Promise<RestartRequest[]> =>
  api.get(`/admin/ec2/${instanceId}/reboot-history`).then(r => r.data || [])

export const listUsers = (): Promise<User[]> =>
  api.get('/admin/users').then(r => r.data || [])

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

// Blackout Windows
export const listBlackoutWindows = (): Promise<BlackoutWindow[]> =>
  api.get('/admin/blackout').then(r => r.data || [])

export const createBlackoutWindow = (payload: {
  name: string
  startTime: string
  endTime: string
  timezone: string
  daysOfWeek: string[]
  scope?: string
  reason?: string
}): Promise<BlackoutWindow> =>
  api.post('/root/blackout', payload).then(r => r.data)

export const updateBlackoutWindow = (id: string, payload: {
  name: string
  startTime: string
  endTime: string
  timezone: string
  daysOfWeek: string[]
  scope?: string
  reason?: string
}): Promise<void> =>
  api.put(`/root/blackout/${id}`, payload).then(r => r.data)

export const deleteBlackoutWindow = (id: string): Promise<void> =>
  api.delete(`/root/blackout/${id}`).then(r => r.data)

export const toggleBlackoutWindow = (id: string, active: boolean): Promise<void> =>
  api.patch(`/root/blackout/${id}/toggle`, null, { params: { active } }).then(r => r.data)

// AWS Accounts
export const listAccounts = (): Promise<AWSAccount[]> =>
  api.get('/root/accounts').then(r => r.data || [])

export const createAccount = (payload: {
  accountId: string
  alias: string
  roleArn: string
  externalId: string
  regions: string[]
  project?: string
}): Promise<AWSAccount> =>
  api.post('/root/accounts', payload).then(r => r.data)

export const deleteAccount = (id: string): Promise<void> =>
  api.delete(`/root/accounts/${id}`).then(r => r.data)

export const generateExternalId = (): Promise<{ externalId: string }> =>
  api.get('/root/accounts/generate-external-id').then(r => r.data)

export const listAccountMembers = (accountId: string): Promise<AccountMember[]> =>
  api.get(`/root/accounts/${accountId}/members`).then(r => r.data || [])

export const addAccountMember = (accountId: string, userId: string): Promise<AccountMember> =>
  api.post(`/root/accounts/${accountId}/members`, { userId }).then(r => r.data)

export const removeAccountMember = (accountId: string, userId: string): Promise<void> =>
  api.delete(`/root/accounts/${accountId}/members/${userId}`).then(r => r.data)
