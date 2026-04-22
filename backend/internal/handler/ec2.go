package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type EC2Handler struct {
	ec2Svc *service.EC2Service
}

func NewEC2Handler(ec2Svc *service.EC2Service) *EC2Handler {
	return &EC2Handler{ec2Svc: ec2Svc}
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
func (h *EC2Handler) GetRebootHistory(c *gin.Context) {
	instanceID := c.Param("instanceId")
	events, err := h.ec2Svc.GetRebootHistory(c.Request.Context(), instanceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if events == nil {
		c.JSON(http.StatusOK, []struct{}{})
		return
	}
	c.JSON(http.StatusOK, events)
}
