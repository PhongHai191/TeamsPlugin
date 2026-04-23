package service

import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
	"github.com/seta-international/team-aws-extension/internal/model"
)

const (
	tableRequests  = "restart-requests"
	tableUsers     = "users"
	tableMFAChallenges = "mfa-challenges"
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
	return requests, attributevalue.UnmarshalListOfMaps(out.Items, &requests)
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
