package handler

import (
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
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
// If user has account memberships → assume role per account and aggregate.
// Root/admin with no memberships fall back to hub-account listing.
func (h *EC2Handler) ListInstances(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)
	userEmail, _ := c.Get(middleware.ContextKeyEmail)

	accounts, err := h.db.ListUserAccounts(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(accounts) == 0 {
		// No account assignments — use hub account directly
		instances, err := h.ec2Svc.ListInstances(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if instances == nil {
			instances = []model.EC2Instance{}
		}
		c.JSON(http.StatusOK, instances)
		return
	}

	email := ""
	if e, ok := userEmail.(string); ok {
		email = e
	}

	var all []model.EC2Instance
	for _, acc := range accounts {
		insts, err := h.ec2Svc.ListInstancesForAccount(c.Request.Context(), acc, email)
		if err != nil {
			// Log but keep going — one failing account shouldn't block others
			continue
		}
		all = append(all, insts...)
	}
	if all == nil {
		all = []model.EC2Instance{}
	}
	c.JSON(http.StatusOK, all)
}

// GET /api/admin/ec2/:instanceId/reboot-history
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
