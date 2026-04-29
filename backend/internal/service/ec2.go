package service

import (
	"context"
	"fmt"
	"log"
	"regexp"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cloudtrail"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/seta-international/team-aws-extension/internal/model"
)

type EC2Service struct {
	baseCfg  aws.Config
	clients  map[string]*ec2.Client // region → client (hub account, fallback)
	stsClient *sts.Client
	ctClient *cloudtrail.Client
}

func NewEC2Service(cfg aws.Config, regions []string) *EC2Service {
	clients := make(map[string]*ec2.Client, len(regions))
	for _, r := range regions {
		rc := cfg.Copy()
		rc.Region = r
		clients[r] = ec2.NewFromConfig(rc)
	}
	return &EC2Service{
		baseCfg:   cfg,
		clients:   clients,
		stsClient: sts.NewFromConfig(cfg),
		ctClient:  cloudtrail.NewFromConfig(cfg),
	}
}

// ── Hub-account EC2 (no AssumeRole) ──────────────────────────────────────────

func (s *EC2Service) ListInstances(ctx context.Context) ([]model.EC2Instance, error) {
	var all []model.EC2Instance
	for region, client := range s.clients {
		insts, err := s.listForRegion(ctx, client, region, "", "", nil)
		if err != nil {
			log.Printf("[EC2] region %s list error: %v", region, err)
			continue
		}
		all = append(all, insts...)
	}
	return all, nil
}

// ListInstancesForAccount assumes the account's role and lists instances across
// all of the account's configured regions.
func (s *EC2Service) ListInstancesForAccount(ctx context.Context, account model.AWSAccount, userEmail string) ([]model.EC2Instance, error) {
	return s.listInstancesForAccountFiltered(ctx, account, userEmail, nil)
}

// ListInstancesForAccountFiltered is like ListInstancesForAccount but restricts
// results to a specific set of instance IDs (for project-scoped user access).
func (s *EC2Service) ListInstancesForAccountFiltered(ctx context.Context, account model.AWSAccount, userEmail string, allowedIDs map[string]bool) ([]model.EC2Instance, error) {
	return s.listInstancesForAccountFiltered(ctx, account, userEmail, allowedIDs)
}

func (s *EC2Service) listInstancesForAccountFiltered(ctx context.Context, account model.AWSAccount, userEmail string, allowedIDs map[string]bool) ([]model.EC2Instance, error) {
	creds, err := s.assumeRole(ctx, account.RoleARN, account.ExternalID, userEmail)
	if err != nil {
		return nil, fmt.Errorf("account %s: %w", account.AccountID, err)
	}
	var all []model.EC2Instance
	for _, region := range account.Regions {
		cfg := s.baseCfg.Copy()
		cfg.Region = region
		cfg.Credentials = creds
		client := ec2.NewFromConfig(cfg)
		insts, err := s.listForRegion(ctx, client, region, account.AccountID, account.Alias, allowedIDs)
		if err != nil {
			log.Printf("[EC2] account %s region %s list error: %v", account.AccountID, region, err)
			continue
		}
		all = append(all, insts...)
	}
	return all, nil
}

func (s *EC2Service) listForRegion(ctx context.Context, client *ec2.Client, region, accountID, accountAlias string, allowedIDs map[string]bool) ([]model.EC2Instance, error) {
	out, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		Filters: []types.Filter{
			{Name: aws.String("tag:Restartable"), Values: []string{"true"}},
			{Name: aws.String("instance-state-name"), Values: []string{"running", "stopped"}},
		},
	})
	if err != nil {
		return nil, err
	}
	var instances []model.EC2Instance
	for _, reservation := range out.Reservations {
		for _, inst := range reservation.Instances {
			id := aws.ToString(inst.InstanceId)
			if allowedIDs != nil && !allowedIDs[id] {
				continue
			}
			instances = append(instances, model.EC2Instance{
				InstanceID:   id,
				Name:         instanceTag(inst.Tags, "Name"),
				State:        string(inst.State.Name),
				InstanceType: string(inst.InstanceType),
				PublicIP:     aws.ToString(inst.PublicIpAddress),
				PrivateIP:    aws.ToString(inst.PrivateIpAddress),
				Region:       region,
				Project:      instanceTag(inst.Tags, "Project"),
				AccountID:    accountID,
				AccountAlias: accountAlias,
			})
		}
	}
	return instances, nil
}

// ── Operations ────────────────────────────────────────────────────────────────

// ExecuteOperation runs an operation using hub-account credentials (no AssumeRole).
func (s *EC2Service) ExecuteOperation(ctx context.Context, instanceID, region string, operation model.OperationType) error {
	client, ok := s.clients[region]
	if !ok {
		for _, c := range s.clients {
			client = c
			break
		}
		log.Printf("[EC2] unknown region %q — using fallback client", region)
	}
	return s.executeWithClient(ctx, client, instanceID, region, operation)
}

// ExecuteOperationWithRole assumes the account's role then executes the operation.
func (s *EC2Service) ExecuteOperationWithRole(ctx context.Context, instanceID, region string, operation model.OperationType, account model.AWSAccount, userEmail string) error {
	creds, err := s.assumeRole(ctx, account.RoleARN, account.ExternalID, userEmail)
	if err != nil {
		return err
	}
	cfg := s.baseCfg.Copy()
	cfg.Region = region
	cfg.Credentials = creds
	client := ec2.NewFromConfig(cfg)
	return s.executeWithClient(ctx, client, instanceID, region, operation)
}

func (s *EC2Service) executeWithClient(ctx context.Context, client *ec2.Client, instanceID, region string, operation model.OperationType) error {
	log.Printf("[EC2] %s %s in %s", operation, instanceID, region)
	var err error
	switch operation {
	case model.OperationReboot:
		_, err = client.RebootInstances(ctx, &ec2.RebootInstancesInput{InstanceIds: []string{instanceID}})
	case model.OperationStop:
		_, err = client.StopInstances(ctx, &ec2.StopInstancesInput{InstanceIds: []string{instanceID}})
	case model.OperationStart:
		_, err = client.StartInstances(ctx, &ec2.StartInstancesInput{InstanceIds: []string{instanceID}})
	default:
		_, err = client.RebootInstances(ctx, &ec2.RebootInstancesInput{InstanceIds: []string{instanceID}})
	}
	if err != nil {
		log.Printf("[EC2] %s FAILED for %s: %v", operation, instanceID, err)
		return err
	}
	log.Printf("[EC2] %s accepted for %s", operation, instanceID)
	return nil
}

// RebootInstance kept for backward compatibility.
func (s *EC2Service) RebootInstance(ctx context.Context, instanceID, region string) error {
	return s.ExecuteOperation(ctx, instanceID, region, model.OperationReboot)
}

// ── AssumeRole ────────────────────────────────────────────────────────────────

func (s *EC2Service) assumeRole(ctx context.Context, roleARN, externalID, userEmail string) (aws.CredentialsProvider, error) {
	sessionName := sanitizeSessionName(userEmail)
	if len(sessionName) < 2 {
		sessionName = "teams-app-session"
	}
	out, err := s.stsClient.AssumeRole(ctx, &sts.AssumeRoleInput{
		RoleArn:         aws.String(roleARN),
		RoleSessionName: aws.String(sessionName),
		ExternalId:      aws.String(externalID),
		DurationSeconds: aws.Int32(900),
	})
	if err != nil {
		return nil, fmt.Errorf("AssumeRole %s: %w", roleARN, err)
	}
	c := out.Credentials
	return aws.CredentialsProviderFunc(func(_ context.Context) (aws.Credentials, error) {
		return aws.Credentials{
			AccessKeyID:     aws.ToString(c.AccessKeyId),
			SecretAccessKey: aws.ToString(c.SecretAccessKey),
			SessionToken:    aws.ToString(c.SessionToken),
		}, nil
	}), nil
}

var invalidSessionChars = regexp.MustCompile(`[^a-zA-Z0-9=,.@\-_]`)

func sanitizeSessionName(email string) string {
	s := invalidSessionChars.ReplaceAllString(email, "-")
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}

func instanceTag(tags []types.Tag, key string) string {
	for _, t := range tags {
		if aws.ToString(t.Key) == key {
			return aws.ToString(t.Value)
		}
	}
	return ""
}
