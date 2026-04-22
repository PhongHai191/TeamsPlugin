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
	tableRequests = "restart-requests"
	tableUsers    = "users"
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
