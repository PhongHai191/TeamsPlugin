package model

import "time"

type Role string

const (
	RoleRoot  Role = "root"
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
)

type UpdateUserRoleBody struct {
	TeamsUserID string `json:"teamsUserId" binding:"required"`
	Role        Role   `json:"role"        binding:"required"`
}

type Status string

const (
	StatusPending  Status = "pending"
	StatusApproved Status = "approved"
	StatusDenied   Status = "denied"
)

type OperationType string

const (
	OperationReboot OperationType = "reboot"
	OperationStop   OperationType = "stop"
	OperationStart  OperationType = "start"
)

type BlackoutWindow struct {
	WindowID   string   `dynamodbav:"windowId"   json:"windowId"`
	Name       string   `dynamodbav:"name"       json:"name"`
	StartTime  string   `dynamodbav:"startTime"  json:"startTime"`
	EndTime    string   `dynamodbav:"endTime"    json:"endTime"`
	Timezone   string   `dynamodbav:"timezone"   json:"timezone"`
	DaysOfWeek []string `dynamodbav:"daysOfWeek" json:"daysOfWeek"`
	Scope      string   `dynamodbav:"scope"      json:"scope"`
	Reason     string   `dynamodbav:"reason"     json:"reason"`
	Active     bool     `dynamodbav:"active"     json:"active"`
	CreatedBy  string   `dynamodbav:"createdBy"  json:"createdBy"`
}

type BlackoutWindowBody struct {
	Name       string   `json:"name"       binding:"required"`
	StartTime  string   `json:"startTime"  binding:"required"`
	EndTime    string   `json:"endTime"    binding:"required"`
	Timezone   string   `json:"timezone"   binding:"required"`
	DaysOfWeek []string `json:"daysOfWeek" binding:"required"`
	Scope      string   `json:"scope"`
	Reason     string   `json:"reason"`
}

type User struct {
	TeamsUserID string `dynamodbav:"teamsUserId" json:"teamsUserId"`
	DisplayName string `dynamodbav:"displayName" json:"displayName"`
	Email       string `dynamodbav:"email"       json:"email"`
	Role        Role   `dynamodbav:"role"        json:"role"`
	TOTPSecret  string `dynamodbav:"totpSecret"  json:"-"`
	TOTPEnabled bool   `dynamodbav:"totpEnabled" json:"totpEnabled"`
}

type TOTPSetupResponse struct {
	OtpauthURL string `json:"otpauthUrl"`
	Secret     string `json:"secret"`
}

type TOTPVerifySetupBody struct {
	Code string `json:"code" binding:"required"`
}

type ApproveWithOTPBody struct {
	RequestID string `json:"requestId" binding:"required"`
	TOTPCode  string `json:"totpCode"`
}

// MFA Number Matching

type MFAChallenge struct {
	ChallengeID   string `dynamodbav:"challengeId"`
	RequestID     string `dynamodbav:"requestId"`
	AdminID       string `dynamodbav:"adminId"`
	InstanceID    string `dynamodbav:"instanceId"`
	InstanceName  string `dynamodbav:"instanceName"`
	InstanceRegion string `dynamodbav:"instanceRegion,omitempty"`
	RequestedBy   string `dynamodbav:"requestedBy"`
	DisplayNumber int    `dynamodbav:"displayNumber"`
	Options       []int  `dynamodbav:"options"`
	Status        string `dynamodbav:"status"` // pending | approved | failed
	ErrorMessage  string `dynamodbav:"errorMessage,omitempty"`
	ExpiresAt     int64  `dynamodbav:"expiresAt"`
}

type CreateMFAChallengeBody struct {
	RequestID string `json:"requestId" binding:"required"`
}

type VerifyMFAChallengeBody struct {
	SelectedNumber int `json:"selectedNumber" binding:"required"`
}

type RestartRequest struct {
	RequestID      string        `dynamodbav:"requestId"                json:"requestId"`
	UserID         string        `dynamodbav:"userId"                   json:"userId"`
	UserName       string        `dynamodbav:"userName"                 json:"userName"`
	InstanceID     string        `dynamodbav:"instanceId"               json:"instanceId"`
	InstanceName   string        `dynamodbav:"instanceName"             json:"instanceName"`
	Region         string        `dynamodbav:"region,omitempty"         json:"region,omitempty"`
	AccountID      string        `dynamodbav:"accountId,omitempty"      json:"accountId,omitempty"`
	ProjectID      string        `dynamodbav:"projectId,omitempty"      json:"projectId,omitempty"`
	Operation      OperationType `dynamodbav:"operation"                json:"operation"`
	Reason         string        `dynamodbav:"reason"                   json:"reason"`
	Status         Status        `dynamodbav:"status"                   json:"status"`
	DenyReason     string        `dynamodbav:"denyReason,omitempty"     json:"denyReason,omitempty"`
	ApprovedBy     string        `dynamodbav:"approvedBy,omitempty"     json:"approvedBy,omitempty"`
	ApprovedByName string        `dynamodbav:"approvedByName,omitempty" json:"approvedByName,omitempty"`
	CreatedAt      time.Time     `dynamodbav:"createdAt"                json:"createdAt"`
	UpdatedAt      time.Time     `dynamodbav:"updatedAt"                json:"updatedAt"`
}

type EC2Instance struct {
	InstanceID   string `json:"instanceId"`
	Name         string `json:"name"`
	State        string `json:"state"`
	InstanceType string `json:"instanceType"`
	PublicIP     string `json:"publicIp,omitempty"`
	PrivateIP    string `json:"privateIp,omitempty"`
	Region       string `json:"region"`
	Project      string `json:"project,omitempty"`
	ProjectID    string `json:"projectId,omitempty"`
	AccountID    string `json:"accountId,omitempty"`
	AccountAlias string `json:"accountAlias,omitempty"`
}

type AWSAccount struct {
	AccountID  string   `dynamodbav:"accountId"  json:"accountId"`
	Alias      string   `dynamodbav:"alias"      json:"alias"`
	RoleARN    string   `dynamodbav:"roleArn"    json:"roleArn"`
	ExternalID string   `dynamodbav:"externalId" json:"-"`
	Regions    []string `dynamodbav:"regions"    json:"regions"`
	Project    string   `dynamodbav:"project"    json:"project"`
	AddedAt    string   `dynamodbav:"addedAt"    json:"addedAt"`
	AddedBy    string   `dynamodbav:"addedBy"    json:"addedBy"`
}

type AWSAccountBody struct {
	AccountID  string   `json:"accountId"  binding:"required"`
	Alias      string   `json:"alias"      binding:"required"`
	RoleARN    string   `json:"roleArn"    binding:"required"`
	ExternalID string   `json:"externalId" binding:"required"`
	Regions    []string `json:"regions"    binding:"required"`
	Project    string   `json:"project"`
}

// ── Projects ──────────────────────────────────────────────────────────────────

type Project struct {
	ProjectID   string   `dynamodbav:"projectId"   json:"projectId"`
	Name        string   `dynamodbav:"name"        json:"name"`
	AccountID   string   `dynamodbav:"accountId"   json:"accountId"`
	InstanceIDs []string `dynamodbav:"instanceIds" json:"instanceIds"`
	CreatedAt   string   `dynamodbav:"createdAt"   json:"createdAt"`
	CreatedBy   string   `dynamodbav:"createdBy"   json:"createdBy"`
	MemberCount int      `dynamodbav:"-"           json:"memberCount,omitempty"`
}

type ProjectMember struct {
	ProjectID string `dynamodbav:"projectId" json:"projectId"`
	UserID    string `dynamodbav:"userId"    json:"userId"`
	Role      string `dynamodbav:"role"      json:"role"` // "admin" | "member"
	AddedAt   string `dynamodbav:"addedAt"   json:"addedAt"`
	AddedBy   string `dynamodbav:"addedBy"   json:"addedBy"`
	UserName  string `dynamodbav:"userName"  json:"userName"`
}

type CreateProjectBody struct {
	Name          string   `json:"name"          binding:"required"`
	AccountID     string   `json:"accountId"     binding:"required"`
	InstanceIDs   []string `json:"instanceIds"`
	ProjectAdmins []string `json:"projectAdmins"`
	Members       []string `json:"members"`
}

type AddProjectMemberBody struct {
	UserID string `json:"userId" binding:"required"`
	Role   string `json:"role"` // "admin" | "member", defaults to "member"
}

// ── Request/response DTOs ─────────────────────────────────────────────────────

type CreateRequestBody struct {
	InstanceID   string        `json:"instanceId"   binding:"required"`
	InstanceName string        `json:"instanceName" binding:"required"`
	Reason       string        `json:"reason"       binding:"required"`
	Region       string        `json:"region"`
	AccountID    string        `json:"accountId"`
	Operation    OperationType `json:"operation"`
	Project      string        `json:"project"`
	ProjectID    string        `json:"projectId"`
}

type ApproveRequestBody struct {
	RequestID string `json:"requestId" binding:"required"`
}

type DenyRequestBody struct {
	RequestID  string `json:"requestId"  binding:"required"`
	DenyReason string `json:"denyReason" binding:"required,min=5"`
}

type RebootEvent struct {
	EventID    string    `json:"eventId"`
	EventTime  time.Time `json:"eventTime"`
	Username   string    `json:"username"`
	InstanceID string    `json:"instanceId"`
}

type TeamsTokenClaims struct {
	OID             string `json:"oid"`
	PreferredUsername string `json:"preferred_username"`
	Name            string `json:"name"`
}
