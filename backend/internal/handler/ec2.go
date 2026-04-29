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
// admin/root: all instances from all accounts.
// user role: instances from their project memberships only.
func (h *EC2Handler) ListInstances(c *gin.Context) {
	role := c.GetString(middleware.ContextKeyRole)
	userID := c.GetString(middleware.ContextKeyUserID)
	email := c.GetString(middleware.ContextKeyEmail)

	if role == string(model.RoleAdmin) || role == string(model.RoleRoot) {
		h.listInstancesAdmin(c, email)
		return
	}

	// User role: aggregate instances from all their projects
	projects, err := h.db.ListUserProjects(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(projects) == 0 {
		c.JSON(http.StatusOK, []model.EC2Instance{})
		return
	}

	// Group allowed instance IDs by accountId, track project info per instanceId
	type projectInfo struct{ id, name string }
	byAccount := map[string]map[string]bool{} // accountId → set of instanceIds
	instanceProj := map[string]projectInfo{}  // instanceId → {projectId, projectName}

	for _, p := range projects {
		if byAccount[p.AccountID] == nil {
			byAccount[p.AccountID] = map[string]bool{}
		}
		for _, iid := range p.InstanceIDs {
			byAccount[p.AccountID][iid] = true
			instanceProj[iid] = projectInfo{id: p.ProjectID, name: p.Name}
		}
	}

	var all []model.EC2Instance
	for accountID, allowedIDs := range byAccount {
		acc, err := h.db.GetAWSAccount(c.Request.Context(), accountID)
		if err != nil || acc == nil {
			continue
		}
		insts, err := h.ec2Svc.ListInstancesForAccountFiltered(c.Request.Context(), *acc, email, allowedIDs)
		if err != nil {
			continue
		}
		for i := range insts {
			if pi, ok := instanceProj[insts[i].InstanceID]; ok {
				insts[i].Project = pi.name
				insts[i].ProjectID = pi.id
			}
		}
		all = append(all, insts...)
	}
	if all == nil {
		all = []model.EC2Instance{}
	}
	c.JSON(http.StatusOK, all)
}

func (h *EC2Handler) listInstancesAdmin(c *gin.Context, email string) {
	accounts, err := h.db.ListAWSAccounts(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(accounts) == 0 {
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

	var all []model.EC2Instance
	for _, acc := range accounts {
		insts, err := h.ec2Svc.ListInstancesForAccount(c.Request.Context(), acc, email)
		if err != nil {
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
