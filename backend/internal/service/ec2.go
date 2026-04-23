package service

import (
	"context"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cloudtrail"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/seta-international/team-aws-extension/internal/model"
)

type EC2Service struct {
	clients  map[string]*ec2.Client // region → client
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
		clients:  clients,
		ctClient: cloudtrail.NewFromConfig(cfg),
	}
}

func (s *EC2Service) ListInstances(ctx context.Context) ([]model.EC2Instance, error) {
	var all []model.EC2Instance
	for region, client := range s.clients {
		insts, err := s.listForRegion(ctx, client, region)
		if err != nil {
			log.Printf("[EC2] region %s list error: %v", region, err)
			continue
		}
		all = append(all, insts...)
	}
	return all, nil
}

func (s *EC2Service) listForRegion(ctx context.Context, client *ec2.Client, region string) ([]model.EC2Instance, error) {
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
			instances = append(instances, model.EC2Instance{
				InstanceID:   aws.ToString(inst.InstanceId),
				Name:         instanceTag(inst.Tags, "Name"),
				State:        string(inst.State.Name),
				InstanceType: string(inst.InstanceType),
				PublicIP:     aws.ToString(inst.PublicIpAddress),
				PrivateIP:    aws.ToString(inst.PrivateIpAddress),
				Region:       region,
				Project:      instanceTag(inst.Tags, "Project"),
			})
		}
	}
	return instances, nil
}

// RebootInstance sends the reboot command to the correct regional client.
func (s *EC2Service) RebootInstance(ctx context.Context, instanceID, region string) error {
	client, ok := s.clients[region]
	if !ok {
		// fallback: use any available client
		for _, c := range s.clients {
			client = c
			break
		}
		log.Printf("[EC2] unknown region %q — using fallback client", region)
	}
	log.Printf("[EC2] RebootInstances %s in %s", instanceID, region)
	_, err := client.RebootInstances(ctx, &ec2.RebootInstancesInput{
		InstanceIds: []string{instanceID},
	})
	if err != nil {
		log.Printf("[EC2] RebootInstances FAILED for %s: %v", instanceID, err)
		return err
	}
	log.Printf("[EC2] RebootInstances accepted for %s", instanceID)
	return nil
}

func instanceTag(tags []types.Tag, key string) string {
	for _, t := range tags {
		if aws.ToString(t.Key) == key {
			return aws.ToString(t.Value)
		}
	}
	return ""
}
