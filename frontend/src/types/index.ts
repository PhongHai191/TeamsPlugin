export type Role = 'root' | 'admin' | 'user'
export type RequestStatus = 'pending' | 'approved' | 'denied'

export interface EC2Instance {
  instanceId: string
  name: string
  state: string
  instanceType: string
  publicIp?: string
  privateIp?: string
}

export interface RestartRequest {
  requestId: string
  userId: string
  userName: string
  instanceId: string
  instanceName: string
  reason: string
  status: RequestStatus
  denyReason?: string
  createdAt: string
  updatedAt: string
}

export interface RebootEvent {
  eventId: string
  eventTime: string
  username: string
  instanceId: string
}

export interface User {
  teamsUserId: string
  displayName: string
  email: string
  role: Role
}

export interface CurrentUser {
  teamsUserId: string
  displayName: string
  email: string
  role: Role
  totpEnabled?: boolean
}
