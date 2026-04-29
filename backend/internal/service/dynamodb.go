package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
	"github.com/seta-international/team-aws-extension/internal/model"
)

const (
	tableRequests        = "restart-requests"
	tableUsers           = "users"
	tableMFAChallenges   = "mfa-challenges"
	tableBlackout        = "blackout-windows"
	tableAccounts        = "aws-accounts"
	tableMembers         = "account-members"
	tableProjects        = "projects"
	tableProjectMembers  = "project-members"
)

type DynamoDBService struct {
	client *dynamodb.Client
}

func NewDynamoDBService(cfg aws.Config) *DynamoDBService {
	return &DynamoDBService{client: dynamodb.NewFromConfig(cfg)}
}

func (s *DynamoDBService) GetOrCreateUser(ctx context.Context, teamsUserID, displayName, email string) (*model.User, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableUsers),
		Key: map[string]types.AttributeValue{
			"teamsUserId": &types.AttributeValueMemberS{Value: teamsUserID},
		},
	})
	if err != nil {
		return nil, err
	}

	if out.Item != nil {
		var user model.User
		if err := attributevalue.UnmarshalMap(out.Item, &user); err != nil {
			return nil, err
		}
		return &user, nil
	}

	// New user — default role is user
	user := model.User{
		TeamsUserID: teamsUserID,
		DisplayName: displayName,
		Email:       email,
		Role:        model.RoleUser,
	}
	item, err := attributevalue.MarshalMap(user)
	if err != nil {
		return nil, err
	}
	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableUsers),
		Item:      item,
	})
	return &user, err
}

func (s *DynamoDBService) CreateRequest(ctx context.Context, req model.RestartRequest) (*model.RestartRequest, error) {
	req.RequestID = uuid.NewString()
	req.Status = model.StatusPending
	req.CreatedAt = time.Now().UTC()
	req.UpdatedAt = req.CreatedAt

	item, err := attributevalue.MarshalMap(req)
	if err != nil {
		return nil, err
	}
	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableRequests),
		Item:      item,
	})
	return &req, err
}

func (s *DynamoDBService) GetRequest(ctx context.Context, requestID string) (*model.RestartRequest, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableRequests),
		Key: map[string]types.AttributeValue{
			"requestId": &types.AttributeValueMemberS{Value: requestID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var req model.RestartRequest
	err = attributevalue.UnmarshalMap(out.Item, &req)
	return &req, err
}

func (s *DynamoDBService) ListRequestsByUser(ctx context.Context, userID string) ([]model.RestartRequest, error) {
	out, err := s.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(tableRequests),
		IndexName:              aws.String("userId-createdAt-index"),
		KeyConditionExpression: aws.String("userId = :uid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
		ScanIndexForward: aws.Bool(false),
	})
	if err != nil {
		return nil, err
	}
	var requests []model.RestartRequest
	return requests, attributevalue.UnmarshalListOfMaps(out.Items, &requests)
}

func (s *DynamoDBService) ListAllRequests(ctx context.Context, statusFilter string) ([]model.RestartRequest, error) {
	input := &dynamodb.ScanInput{TableName: aws.String(tableRequests)}
	if statusFilter != "" {
		input.FilterExpression = aws.String("#s = :status")
		input.ExpressionAttributeNames = map[string]string{"#s": "status"}
		input.ExpressionAttributeValues = map[string]types.AttributeValue{
			":status": &types.AttributeValueMemberS{Value: statusFilter},
		}
	}
	out, err := s.client.Scan(ctx, input)
	if err != nil {
		return nil, err
	}
	var requests []model.RestartRequest
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &requests); err != nil {
		return nil, err
	}
	sort.Slice(requests, func(i, j int) bool {
		return requests[i].CreatedAt.After(requests[j].CreatedAt)
	})
	return requests, nil
}

func (s *DynamoDBService) UpdateRequestStatus(ctx context.Context, requestID string, status model.Status, denyReason string) error {
	expr := "SET #s = :status, updatedAt = :now"
	vals := map[string]types.AttributeValue{
		":status": &types.AttributeValueMemberS{Value: string(status)},
		":now":    &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
	}
	if denyReason != "" {
		expr += ", denyReason = :dr"
		vals[":dr"] = &types.AttributeValueMemberS{Value: denyReason}
	}
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableRequests),
		Key: map[string]types.AttributeValue{
			"requestId": &types.AttributeValueMemberS{Value: requestID},
		},
		UpdateExpression:          aws.String(expr),
		ExpressionAttributeNames:  map[string]string{"#s": "status"},
		ExpressionAttributeValues: vals,
	})
	return err
}

// ApproveRequest marks a request as approved and records who approved it.
func (s *DynamoDBService) ApproveRequest(ctx context.Context, requestID, approvedBy, approvedByName string) error {
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableRequests),
		Key: map[string]types.AttributeValue{
			"requestId": &types.AttributeValueMemberS{Value: requestID},
		},
		UpdateExpression: aws.String("SET #s = :status, updatedAt = :now, approvedBy = :ab, approvedByName = :abn"),
		ExpressionAttributeNames: map[string]string{"#s": "status"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":status": &types.AttributeValueMemberS{Value: string(model.StatusApproved)},
			":now":    &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
			":ab":     &types.AttributeValueMemberS{Value: approvedBy},
			":abn":    &types.AttributeValueMemberS{Value: approvedByName},
		},
	})
	return err
}

// ListApprovedByInstance returns all approved requests for a given instance, most recent first.
func (s *DynamoDBService) ListApprovedByInstance(ctx context.Context, instanceID string) ([]model.RestartRequest, error) {
	out, err := s.client.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String(tableRequests),
		FilterExpression: aws.String("instanceId = :iid AND #s = :approved"),
		ExpressionAttributeNames: map[string]string{"#s": "status"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":iid":      &types.AttributeValueMemberS{Value: instanceID},
			":approved": &types.AttributeValueMemberS{Value: string(model.StatusApproved)},
		},
	})
	if err != nil {
		return nil, err
	}
	var requests []model.RestartRequest
	return requests, attributevalue.UnmarshalListOfMaps(out.Items, &requests)
}

// GetUser fetches a single user by teamsUserId.
func (s *DynamoDBService) GetUser(ctx context.Context, teamsUserID string) (*model.User, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableUsers),
		Key: map[string]types.AttributeValue{
			"teamsUserId": &types.AttributeValueMemberS{Value: teamsUserID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var user model.User
	err = attributevalue.UnmarshalMap(out.Item, &user)
	return &user, err
}

// SaveTOTPSecret persists the TOTP secret (not yet enabled).
func (s *DynamoDBService) SaveTOTPSecret(ctx context.Context, teamsUserID, secret string) error {
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableUsers),
		Key: map[string]types.AttributeValue{
			"teamsUserId": &types.AttributeValueMemberS{Value: teamsUserID},
		},
		UpdateExpression:         aws.String("SET totpSecret = :s, totpEnabled = :f"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: secret},
			":f": &types.AttributeValueMemberBOOL{Value: false},
		},
	})
	return err
}

// ClearTOTPSecret removes the TOTP secret and disables TOTP for a user.
func (s *DynamoDBService) ClearTOTPSecret(ctx context.Context, teamsUserID string) error {
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableUsers),
		Key: map[string]types.AttributeValue{
			"teamsUserId": &types.AttributeValueMemberS{Value: teamsUserID},
		},
		UpdateExpression: aws.String("REMOVE totpSecret SET totpEnabled = :f"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":f": &types.AttributeValueMemberBOOL{Value: false},
		},
	})
	return err
}

// EnableTOTP marks TOTP as active after first successful verification.
func (s *DynamoDBService) EnableTOTP(ctx context.Context, teamsUserID string) error {
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableUsers),
		Key: map[string]types.AttributeValue{
			"teamsUserId": &types.AttributeValueMemberS{Value: teamsUserID},
		},
		UpdateExpression:         aws.String("SET totpEnabled = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	return err
}

// ListUsers returns all users, optionally filtered by role.
func (s *DynamoDBService) ListUsers(ctx context.Context, roleFilter string) ([]model.User, error) {
	input := &dynamodb.ScanInput{TableName: aws.String(tableUsers)}
	if roleFilter != "" {
		input.FilterExpression = aws.String("#r = :role")
		input.ExpressionAttributeNames = map[string]string{"#r": "role"}
		input.ExpressionAttributeValues = map[string]types.AttributeValue{
			":role": &types.AttributeValueMemberS{Value: roleFilter},
		}
	}
	out, err := s.client.Scan(ctx, input)
	if err != nil {
		return nil, err
	}
	var users []model.User
	return users, attributevalue.UnmarshalListOfMaps(out.Items, &users)
}

// ── MFA Challenges ────────────────────────────────────────────────────────────

func (s *DynamoDBService) CreateMFAChallenge(ctx context.Context, c model.MFAChallenge) error {
	item, err := attributevalue.MarshalMap(c)
	if err != nil {
		return err
	}
	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableMFAChallenges),
		Item:      item,
	})
	return err
}

func (s *DynamoDBService) GetMFAChallenge(ctx context.Context, challengeID string) (*model.MFAChallenge, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableMFAChallenges),
		Key: map[string]types.AttributeValue{
			"challengeId": &types.AttributeValueMemberS{Value: challengeID},
		},
	})
	if err != nil || out.Item == nil {
		return nil, err
	}
	var c model.MFAChallenge
	err = attributevalue.UnmarshalMap(out.Item, &c)
	return &c, err
}

// GetPendingChallengeForAdmin scans for the latest pending challenge owned by adminID.
func (s *DynamoDBService) GetPendingChallengeForAdmin(ctx context.Context, adminID string) (*model.MFAChallenge, error) {
	out, err := s.client.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String(tableMFAChallenges),
		FilterExpression: aws.String("adminId = :a AND #s = :p"),
		ExpressionAttributeNames:  map[string]string{"#s": "status"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":a": &types.AttributeValueMemberS{Value: adminID},
			":p": &types.AttributeValueMemberS{Value: "pending"},
		},
	})
	if err != nil || len(out.Items) == 0 {
		return nil, err
	}
	var c model.MFAChallenge
	err = attributevalue.UnmarshalMap(out.Items[0], &c)
	return &c, err
}

func (s *DynamoDBService) ResolveMFAChallenge(ctx context.Context, challengeID, status, errMsg string) error {
	expr := "SET #s = :status"
	vals := map[string]types.AttributeValue{
		":status":  &types.AttributeValueMemberS{Value: status},
		":pending": &types.AttributeValueMemberS{Value: "pending"},
	}
	if errMsg != "" {
		expr += ", errorMessage = :e"
		vals[":e"] = &types.AttributeValueMemberS{Value: errMsg}
	}
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 aws.String(tableMFAChallenges),
		Key:                       map[string]types.AttributeValue{"challengeId": &types.AttributeValueMemberS{Value: challengeID}},
		UpdateExpression:          aws.String(expr),
		ConditionExpression:       aws.String("#s = :pending"),
		ExpressionAttributeNames:  map[string]string{"#s": "status"},
		ExpressionAttributeValues: vals,
	})
	return err
}

// UpdateUserRole changes the role of a user. Only allows admin↔user transitions for admin callers;
// root can set any role.
func (s *DynamoDBService) UpdateUserRole(ctx context.Context, teamsUserID string, newRole model.Role) error {
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableUsers),
		Key: map[string]types.AttributeValue{
			"teamsUserId": &types.AttributeValueMemberS{Value: teamsUserID},
		},
		UpdateExpression:         aws.String("SET #r = :role"),
		ExpressionAttributeNames: map[string]string{"#r": "role"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":role": &types.AttributeValueMemberS{Value: string(newRole)},
		},
		ConditionExpression: aws.String("attribute_exists(teamsUserId)"),
	})
	return err
}

// ── Blackout Windows ──────────────────────────────────────────────────────────

func (s *DynamoDBService) CreateBlackoutWindow(ctx context.Context, w model.BlackoutWindow) (*model.BlackoutWindow, error) {
	w.WindowID = uuid.NewString()
	w.Active = true
	item, err := attributevalue.MarshalMap(w)
	if err != nil {
		return nil, err
	}
	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableBlackout),
		Item:      item,
	})
	return &w, err
}

func (s *DynamoDBService) ListBlackoutWindows(ctx context.Context) ([]model.BlackoutWindow, error) {
	out, err := s.client.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(tableBlackout)})
	if err != nil {
		return nil, err
	}
	var windows []model.BlackoutWindow
	return windows, attributevalue.UnmarshalListOfMaps(out.Items, &windows)
}

func (s *DynamoDBService) UpdateBlackoutWindow(ctx context.Context, windowID string, body model.BlackoutWindowBody) error {
	dow, err := attributevalue.Marshal(body.DaysOfWeek)
	if err != nil {
		return err
	}
	_, err = s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableBlackout),
		Key: map[string]types.AttributeValue{
			"windowId": &types.AttributeValueMemberS{Value: windowID},
		},
		UpdateExpression: aws.String("SET #n = :n, startTime = :st, endTime = :et, timezone = :tz, daysOfWeek = :dow, scope = :sc, reason = :r"),
		ExpressionAttributeNames: map[string]string{"#n": "name"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":n":   &types.AttributeValueMemberS{Value: body.Name},
			":st":  &types.AttributeValueMemberS{Value: body.StartTime},
			":et":  &types.AttributeValueMemberS{Value: body.EndTime},
			":tz":  &types.AttributeValueMemberS{Value: body.Timezone},
			":dow": dow,
			":sc":  &types.AttributeValueMemberS{Value: body.Scope},
			":r":   &types.AttributeValueMemberS{Value: body.Reason},
		},
		ConditionExpression: aws.String("attribute_exists(windowId)"),
	})
	return err
}

func (s *DynamoDBService) DeleteBlackoutWindow(ctx context.Context, windowID string) error {
	_, err := s.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(tableBlackout),
		Key: map[string]types.AttributeValue{
			"windowId": &types.AttributeValueMemberS{Value: windowID},
		},
	})
	return err
}

func (s *DynamoDBService) ToggleBlackoutWindow(ctx context.Context, windowID string, active bool) error {
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableBlackout),
		Key: map[string]types.AttributeValue{
			"windowId": &types.AttributeValueMemberS{Value: windowID},
		},
		UpdateExpression: aws.String("SET active = :a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":a": &types.AttributeValueMemberBOOL{Value: active},
		},
		ConditionExpression: aws.String("attribute_exists(windowId)"),
	})
	return err
}

// CheckBlackout returns the first active blackout window that blocks the given project+operation.
// Returns nil if no window is blocking.
func (s *DynamoDBService) CheckBlackout(ctx context.Context, project string, operation model.OperationType) (*model.BlackoutWindow, error) {
	out, err := s.client.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String(tableBlackout),
		FilterExpression: aws.String("active = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":t": &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		return nil, err
	}
	var windows []model.BlackoutWindow
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &windows); err != nil {
		return nil, err
	}
	for i := range windows {
		w := &windows[i]
		if windowBlocks(w, project, string(operation)) {
			return w, nil
		}
	}
	return nil, nil
}

// windowBlocks checks whether window w blocks the given project+operation at the current moment.
func windowBlocks(w *model.BlackoutWindow, project, operation string) bool {
	loc, err := time.LoadLocation(w.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)

	// Check day of week
	day := now.Weekday().String()[:3] // "Mon", "Tue", ...
	dayMatch := false
	for _, d := range w.DaysOfWeek {
		if strings.EqualFold(d, day) {
			dayMatch = true
			break
		}
	}
	if !dayMatch {
		return false
	}

	// Check time range (HH:MM format)
	currentHHMM := fmt.Sprintf("%02d:%02d", now.Hour(), now.Minute())
	if currentHHMM < w.StartTime || currentHHMM >= w.EndTime {
		return false
	}

	// Check scope
	scope := w.Scope
	if scope == "" || scope == "all" {
		return true
	}
	if strings.HasPrefix(scope, "project:") {
		targetProject := strings.TrimPrefix(scope, "project:")
		return strings.EqualFold(targetProject, project)
	}
	if strings.HasPrefix(scope, "operation:") {
		ops := strings.Split(strings.TrimPrefix(scope, "operation:"), ",")
		for _, op := range ops {
			if strings.EqualFold(strings.TrimSpace(op), operation) {
				return true
			}
		}
		return false
	}
	return true
}

// ── AWS Accounts ──────────────────────────────────────────────────────────────

func (s *DynamoDBService) CreateAWSAccount(ctx context.Context, a model.AWSAccount) (*model.AWSAccount, error) {
	item, err := attributevalue.MarshalMap(a)
	if err != nil {
		return nil, err
	}
	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           aws.String(tableAccounts),
		Item:                item,
		ConditionExpression: aws.String("attribute_not_exists(accountId)"),
	})
	return &a, err
}

func (s *DynamoDBService) ListAWSAccounts(ctx context.Context) ([]model.AWSAccount, error) {
	out, err := s.client.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(tableAccounts)})
	if err != nil {
		return nil, err
	}
	var accounts []model.AWSAccount
	return accounts, attributevalue.UnmarshalListOfMaps(out.Items, &accounts)
}

func (s *DynamoDBService) GetAWSAccount(ctx context.Context, accountID string) (*model.AWSAccount, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableAccounts),
		Key:       map[string]types.AttributeValue{"accountId": &types.AttributeValueMemberS{Value: accountID}},
	})
	if err != nil || out.Item == nil {
		return nil, err
	}
	var a model.AWSAccount
	err = attributevalue.UnmarshalMap(out.Item, &a)
	return &a, err
}

func (s *DynamoDBService) DeleteAWSAccount(ctx context.Context, accountID string) error {
	_, err := s.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(tableAccounts),
		Key:       map[string]types.AttributeValue{"accountId": &types.AttributeValueMemberS{Value: accountID}},
	})
	return err
}


// ── Projects ──────────────────────────────────────────────────────────────────

func (s *DynamoDBService) CreateProject(ctx context.Context, p model.Project) (*model.Project, error) {
	p.ProjectID = uuid.NewString()
	p.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	item, err := attributevalue.MarshalMap(p)
	if err != nil {
		return nil, err
	}
	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableProjects),
		Item:      item,
	})
	return &p, err
}

func (s *DynamoDBService) GetProject(ctx context.Context, projectID string) (*model.Project, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableProjects),
		Key:       map[string]types.AttributeValue{"projectId": &types.AttributeValueMemberS{Value: projectID}},
	})
	if err != nil || out.Item == nil {
		return nil, err
	}
	var p model.Project
	err = attributevalue.UnmarshalMap(out.Item, &p)
	return &p, err
}

func (s *DynamoDBService) ListAllProjects(ctx context.Context) ([]model.Project, error) {
	out, err := s.client.Scan(ctx, &dynamodb.ScanInput{TableName: aws.String(tableProjects)})
	if err != nil {
		return nil, err
	}
	var projects []model.Project
	return projects, attributevalue.UnmarshalListOfMaps(out.Items, &projects)
}

// DeleteProject removes the project, all its members, and denies pending requests belonging to it.
func (s *DynamoDBService) DeleteProject(ctx context.Context, projectID string) error {
	// Deny pending requests for this project
	reqOut, err := s.client.Scan(ctx, &dynamodb.ScanInput{
		TableName:        aws.String(tableRequests),
		FilterExpression: aws.String("projectId = :pid AND #s = :pending"),
		ExpressionAttributeNames: map[string]string{"#s": "status"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pid":     &types.AttributeValueMemberS{Value: projectID},
			":pending": &types.AttributeValueMemberS{Value: string(model.StatusPending)},
		},
	})
	if err == nil {
		now := time.Now().UTC().Format(time.RFC3339)
		for _, item := range reqOut.Items {
			var req model.RestartRequest
			if attributevalue.UnmarshalMap(item, &req) == nil {
				s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
					TableName: aws.String(tableRequests),
					Key:       map[string]types.AttributeValue{"requestId": &types.AttributeValueMemberS{Value: req.RequestID}},
					UpdateExpression: aws.String("SET #s = :denied, denyReason = :dr, updatedAt = :now"),
					ExpressionAttributeNames: map[string]string{"#s": "status"},
					ExpressionAttributeValues: map[string]types.AttributeValue{
						":denied": &types.AttributeValueMemberS{Value: string(model.StatusDenied)},
						":dr":     &types.AttributeValueMemberS{Value: "Project deleted"},
						":now":    &types.AttributeValueMemberS{Value: now},
					},
				})
			}
		}
	}

	// Remove all project members
	members, err := s.ListProjectMembers(ctx, projectID)
	if err == nil {
		for _, m := range members {
			s.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
				TableName: aws.String(tableProjectMembers),
				Key: map[string]types.AttributeValue{
					"projectId": &types.AttributeValueMemberS{Value: projectID},
					"userId":    &types.AttributeValueMemberS{Value: m.UserID},
				},
			})
		}
	}

	_, err = s.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(tableProjects),
		Key:       map[string]types.AttributeValue{"projectId": &types.AttributeValueMemberS{Value: projectID}},
	})
	return err
}

// ── Project Members ───────────────────────────────────────────────────────────

func (s *DynamoDBService) AddProjectMember(ctx context.Context, m model.ProjectMember) error {
	if m.Role == "" {
		m.Role = "member"
	}
	m.AddedAt = time.Now().UTC().Format(time.RFC3339)
	item, err := attributevalue.MarshalMap(m)
	if err != nil {
		return err
	}
	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableProjectMembers),
		Item:      item,
	})
	return err
}

func (s *DynamoDBService) RemoveProjectMember(ctx context.Context, projectID, userID string) error {
	_, err := s.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(tableProjectMembers),
		Key: map[string]types.AttributeValue{
			"projectId": &types.AttributeValueMemberS{Value: projectID},
			"userId":    &types.AttributeValueMemberS{Value: userID},
		},
	})
	return err
}

func (s *DynamoDBService) ListProjectMembers(ctx context.Context, projectID string) ([]model.ProjectMember, error) {
	out, err := s.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(tableProjectMembers),
		KeyConditionExpression: aws.String("projectId = :pid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pid": &types.AttributeValueMemberS{Value: projectID},
		},
	})
	if err != nil {
		return nil, err
	}
	var members []model.ProjectMember
	return members, attributevalue.UnmarshalListOfMaps(out.Items, &members)
}

func (s *DynamoDBService) GetProjectMember(ctx context.Context, projectID, userID string) (*model.ProjectMember, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableProjectMembers),
		Key: map[string]types.AttributeValue{
			"projectId": &types.AttributeValueMemberS{Value: projectID},
			"userId":    &types.AttributeValueMemberS{Value: userID},
		},
	})
	if err != nil || out.Item == nil {
		return nil, err
	}
	var m model.ProjectMember
	err = attributevalue.UnmarshalMap(out.Item, &m)
	return &m, err
}

// ListUserProjects returns all projects a user is a member of (any role).
func (s *DynamoDBService) ListUserProjects(ctx context.Context, userID string) ([]model.Project, error) {
	out, err := s.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(tableProjectMembers),
		IndexName:              aws.String("userId-index"),
		KeyConditionExpression: aws.String("userId = :uid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
	})
	if err != nil {
		return nil, err
	}
	var memberships []model.ProjectMember
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &memberships); err != nil {
		return nil, err
	}
	var projects []model.Project
	for _, m := range memberships {
		p, err := s.GetProject(ctx, m.ProjectID)
		if err != nil || p == nil {
			continue
		}
		projects = append(projects, *p)
	}
	return projects, nil
}

// ListRequestsByProject returns all requests belonging to a project.
func (s *DynamoDBService) ListRequestsByProject(ctx context.Context, projectID, statusFilter string) ([]model.RestartRequest, error) {
	input := &dynamodb.ScanInput{
		TableName:        aws.String(tableRequests),
		FilterExpression: aws.String("projectId = :pid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pid": &types.AttributeValueMemberS{Value: projectID},
		},
	}
	if statusFilter != "" {
		input.FilterExpression = aws.String("projectId = :pid AND #s = :status")
		input.ExpressionAttributeNames = map[string]string{"#s": "status"}
		input.ExpressionAttributeValues[":status"] = &types.AttributeValueMemberS{Value: statusFilter}
	}
	out, err := s.client.Scan(ctx, input)
	if err != nil {
		return nil, err
	}
	var requests []model.RestartRequest
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &requests); err != nil {
		return nil, err
	}
	sort.Slice(requests, func(i, j int) bool {
		return requests[i].CreatedAt.After(requests[j].CreatedAt)
	})
	return requests, nil
}
