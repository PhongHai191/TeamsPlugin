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
	RequestID      string    `dynamodbav:"requestId"                json:"requestId"`
	UserID         string    `dynamodbav:"userId"                   json:"userId"`
	UserName       string    `dynamodbav:"userName"                 json:"userName"`
	InstanceID     string    `dynamodbav:"instanceId"               json:"instanceId"`
	InstanceName   string    `dynamodbav:"instanceName"             json:"instanceName"`
	Region         string    `dynamodbav:"region,omitempty"         json:"region,omitempty"`
	Reason         string    `dynamodbav:"reason"                   json:"reason"`
	Status         Status    `dynamodbav:"status"                   json:"status"`
	DenyReason     string    `dynamodbav:"denyReason,omitempty"     json:"denyReason,omitempty"`
	ApprovedBy     string    `dynamodbav:"approvedBy,omitempty"     json:"approvedBy,omitempty"`
	ApprovedByName string    `dynamodbav:"approvedByName,omitempty" json:"approvedByName,omitempty"`
	CreatedAt      time.Time `dynamodbav:"createdAt"                json:"createdAt"`
	UpdatedAt      time.Time `dynamodbav:"updatedAt"                json:"updatedAt"`
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
}

// Request/response DTOs
type CreateRequestBody struct {
	InstanceID   string `json:"instanceId"   binding:"required"`
	InstanceName string `json:"instanceName" binding:"required"`
	Reason       string `json:"reason"       binding:"required"`
	Region       string `json:"region"`
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
