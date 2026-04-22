package service

import (
	"context"
	"encoding/json"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cloudtrail"
	ctTypes "github.com/aws/aws-sdk-go-v2/service/cloudtrail/types"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/seta-international/team-aws-extension/internal/model"
)

type EC2Service struct {
	client   *ec2.Client
	ctClient *cloudtrail.Client
}

func NewEC2Service(cfg aws.Config) *EC2Service {
	return &EC2Service{
		client:   ec2.NewFromConfig(cfg),
		ctClient: cloudtrail.NewFromConfig(cfg),
	}
}

func (s *EC2Service) ListInstances(ctx context.Context) ([]model.EC2Instance, error) {
	out, err := s.client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		Filters: []types.Filter{
			// Only show instances tagged Restartable=true
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
			name := instanceTag(inst.Tags, "Name")
			instances = append(instances, model.EC2Instance{
				InstanceID:   aws.ToString(inst.InstanceId),
				Name:         name,
				State:        string(inst.State.Name),
				InstanceType: string(inst.InstanceType),
				PublicIP:     aws.ToString(inst.PublicIpAddress),
				PrivateIP:    aws.ToString(inst.PrivateIpAddress),
			})
		}
	}
	return instances, nil
}

func (s *EC2Service) RebootInstance(ctx context.Context, instanceID string) error {
	log.Printf("[EC2] Sending RebootInstances request for %s", instanceID)
	out, err := s.client.RebootInstances(ctx, &ec2.RebootInstancesInput{
		InstanceIds: []string{instanceID},
	})
	if err != nil {
		log.Printf("[EC2] RebootInstances FAILED for %s: %v", instanceID, err)
		return err
	}
	log.Printf("[EC2] RebootInstances SUCCESS for %s — response: %+v", instanceID, out.ResultMetadata)
	return nil
}

// GetRebootHistory returns the last 20 RebootInstances events for an instance from CloudTrail.
func (s *EC2Service) GetRebootHistory(ctx context.Context, instanceID string) ([]model.RebootEvent, error) {
	out, err := s.ctClient.LookupEvents(ctx, &cloudtrail.LookupEventsInput{
		LookupAttributes: []ctTypes.LookupAttribute{
			{
				AttributeKey:   ctTypes.LookupAttributeKeyEventName,
				AttributeValue: aws.String("RebootInstances"),
			},
		},
		MaxResults: aws.Int32(20),
	})
	if err != nil {
		return nil, err
	}

	var events []model.RebootEvent
	for _, e := range out.Events {
		// Filter by instanceID from the raw CloudTrail resource list
		matched := false
		for _, r := range e.Resources {
			if aws.ToString(r.ResourceName) == instanceID {
				matched = true
				break
			}
		}
		// Also check inside CloudTrailEvent JSON for the instance ID
		if !matched && e.CloudTrailEvent != nil {
			matched = containsInstanceID(*e.CloudTrailEvent, instanceID)
		}
		if !matched {
			continue
		}
		events = append(events, model.RebootEvent{
			EventID:    aws.ToString(e.EventId),
			EventTime:  aws.ToTime(e.EventTime),
			Username:   aws.ToString(e.Username),
			InstanceID: instanceID,
		})
	}
	return events, nil
}

func containsInstanceID(rawEvent, instanceID string) bool {
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(rawEvent), &payload); err != nil {
		return false
	}
	req, _ := payload["requestParameters"].(map[string]interface{})
	if req == nil {
		return false
	}
	items, _ := req["instancesSet"].(map[string]interface{})
	if items == nil {
		return false
	}
	list, _ := items["items"].([]interface{})
	for _, item := range list {
		m, _ := item.(map[string]interface{})
		if m["instanceId"] == instanceID {
			return true
		}
	}
	return false
}

func instanceTag(tags []types.Tag, key string) string {
	for _, t := range tags {
		if aws.ToString(t.Key) == key {
			return aws.ToString(t.Value)
		}
	}
	return ""
}
