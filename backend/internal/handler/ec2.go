package handler

import (
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type EC2Handler struct {
	ec2Svc *service.EC2Service
	db     *service.DynamoDBService
}

func NewEC2Handler(ec2Svc *service.EC2Service, db *service.DynamoDBService) *EC2Handler {
	return &EC2Handler{ec2Svc: ec2Svc, db: db}
}

// GET /api/ec2/instances
func (h *EC2Handler) ListInstances(c *gin.Context) {
	instances, err := h.ec2Svc.ListInstances(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, instances)
}

// GET /api/admin/ec2/:instanceId/reboot-history
// Returns all approved reboot requests for the instance from DynamoDB, most recent first.
func (h *EC2Handler) GetRebootHistory(c *gin.Context) {
	instanceID := c.Param("instanceId")
	records, err := h.db.ListApprovedByInstance(c.Request.Context(), instanceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if records == nil {
		c.JSON(http.StatusOK, []struct{}{})
		return
	}
	sort.Slice(records, func(i, j int) bool {
		return records[i].UpdatedAt.After(records[j].UpdatedAt)
	})
	c.JSON(http.StatusOK, records)
}
