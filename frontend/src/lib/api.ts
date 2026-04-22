import axios from 'axios'
import type { EC2Instance, RebootEvent, RestartRequest } from '../types'

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

export const getRebootHistory = (instanceId: string): Promise<RebootEvent[]> =>
  api.get(`/admin/ec2/${instanceId}/reboot-history`).then(r => r.data)
