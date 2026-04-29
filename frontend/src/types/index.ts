export type Role = 'root' | 'admin' | 'user'
export type RequestStatus = 'pending' | 'approved' | 'denied'
export type OperationType = 'reboot' | 'stop' | 'start'

export interface EC2Instance {
  instanceId: string
  name: string
  state: string
  instanceType: string
  publicIp?: string
  privateIp?: string
  region: string
  project?: string
  projectId?: string
  accountId?: string
  accountAlias?: string
}

export interface RestartRequest {
  requestId: string
  userId: string
  userName: string
  instanceId: string
  instanceName: string
  region?: string
  accountId?: string
  projectId?: string
  operation?: OperationType
  reason: string
  status: RequestStatus
  denyReason?: string
  approvedBy?: string
  approvedByName?: string
  createdAt: string
  updatedAt: string
}

export interface AWSAccount {
  accountId: string
  alias: string
  roleArn: string
  regions: string[]
  project: string
  addedAt: string
  addedBy: string
  // externalId intentionally omitted — never returned from API
}

export interface BlackoutWindow {
  windowId: string
  name: string
  startTime: string
  endTime: string
  timezone: string
  daysOfWeek: string[]
  scope: string
  reason: string
  active: boolean
  createdBy: string
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

export interface Project {
  projectId: string
  name: string
  accountId: string
  instanceIds: string[]
  createdAt: string
  createdBy: string
  memberCount?: number
}

export interface ProjectMember {
  projectId: string
  userId: string
  role: 'admin' | 'member'
  addedAt: string
  addedBy: string
  userName: string
}
