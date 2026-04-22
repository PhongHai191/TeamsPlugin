package model

import "time"

type Role string

const (
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
)

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
}

type RestartRequest struct {
	RequestID   string    `dynamodbav:"requestId"   json:"requestId"`
	UserID      string    `dynamodbav:"userId"      json:"userId"`
	UserName    string    `dynamodbav:"userName"    json:"userName"`
	InstanceID  string    `dynamodbav:"instanceId"  json:"instanceId"`
	InstanceName string   `dynamodbav:"instanceName" json:"instanceName"`
	Reason      string    `dynamodbav:"reason"      json:"reason"`
	Status      Status    `dynamodbav:"status"      json:"status"`
	DenyReason  string    `dynamodbav:"denyReason"  json:"denyReason,omitempty"`
	CreatedAt   time.Time `dynamodbav:"createdAt"   json:"createdAt"`
	UpdatedAt   time.Time `dynamodbav:"updatedAt"   json:"updatedAt"`
}

type EC2Instance struct {
	InstanceID   string `json:"instanceId"`
	Name         string `json:"name"`
	State        string `json:"state"`
	InstanceType string `json:"instanceType"`
	PublicIP     string `json:"publicIp,omitempty"`
	PrivateIP    string `json:"privateIp,omitempty"`
}

// Request/response DTOs
type CreateRequestBody struct {
	InstanceID   string `json:"instanceId" binding:"required"`
	InstanceName string `json:"instanceName" binding:"required"`
	Reason       string `json:"reason" binding:"required"`
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
