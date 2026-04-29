package handler

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type ProjectsHandler struct {
	db     *service.DynamoDBService
	ec2Svc *service.EC2Service
}

func NewProjectsHandler(db *service.DynamoDBService, ec2Svc *service.EC2Service) *ProjectsHandler {
	return &ProjectsHandler{db: db, ec2Svc: ec2Svc}
}

// GET /api/admin/projects — admin sees all projects with member count
func (h *ProjectsHandler) ListAll(c *gin.Context) {
	projects, err := h.db.ListAllProjects(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range projects {
		members, _ := h.db.ListProjectMembers(c.Request.Context(), projects[i].ProjectID)
		projects[i].MemberCount = len(members)
	}
	if projects == nil {
		projects = []model.Project{}
	}
	c.JSON(http.StatusOK, projects)
}

// GET /api/projects — any user sees their own projects with member count
func (h *ProjectsHandler) ListMine(c *gin.Context) {
	userID := c.GetString(middleware.ContextKeyUserID)
	role := c.GetString(middleware.ContextKeyRole)

	var projects []model.Project
	var err error
	if role == string(model.RoleAdmin) || role == string(model.RoleRoot) {
		projects, err = h.db.ListAllProjects(c.Request.Context())
	} else {
		projects, err = h.db.ListUserProjects(c.Request.Context(), userID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range projects {
		members, _ := h.db.ListProjectMembers(c.Request.Context(), projects[i].ProjectID)
		projects[i].MemberCount = len(members)
	}
	if projects == nil {
		projects = []model.Project{}
	}
	c.JSON(http.StatusOK, projects)
}

// POST /api/admin/projects — admin creates a project
func (h *ProjectsHandler) Create(c *gin.Context) {
	var body model.CreateProjectBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	createdBy := c.GetString(middleware.ContextKeyUserID)

	p := model.Project{
		Name:        body.Name,
		AccountID:   body.AccountID,
		InstanceIDs: body.InstanceIDs,
		CreatedBy:   createdBy,
	}
	created, err := h.db.CreateProject(c.Request.Context(), p)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Add project admins
	for _, uid := range body.ProjectAdmins {
		user, err := h.db.GetUser(c.Request.Context(), uid)
		if err != nil || user == nil {
			continue
		}
		h.db.AddProjectMember(c.Request.Context(), model.ProjectMember{
			ProjectID: created.ProjectID,
			UserID:    uid,
			Role:      "admin",
			AddedBy:   createdBy,
			UserName:  user.DisplayName,
		})
	}

	// Add regular members (skip duplicates already added as admin)
	adminSet := make(map[string]bool, len(body.ProjectAdmins))
	for _, uid := range body.ProjectAdmins {
		adminSet[uid] = true
	}
	for _, uid := range body.Members {
		if adminSet[uid] {
			continue
		}
		user, err := h.db.GetUser(c.Request.Context(), uid)
		if err != nil || user == nil {
			continue
		}
		h.db.AddProjectMember(c.Request.Context(), model.ProjectMember{
			ProjectID: created.ProjectID,
			UserID:    uid,
			Role:      "member",
			AddedBy:   createdBy,
			UserName:  user.DisplayName,
		})
	}

	c.JSON(http.StatusCreated, created)
}

// DELETE /api/admin/projects/:id — admin deletes project + cascade
func (h *ProjectsHandler) Delete(c *gin.Context) {
	if err := h.db.DeleteProject(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// GET /api/admin/accounts/:id/instances — load instances from an account (for create project form)
func (h *ProjectsHandler) ListAccountInstances(c *gin.Context) {
	accountID := c.Param("id")
	acc, err := h.db.GetAWSAccount(c.Request.Context(), accountID)
	if err != nil || acc == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	email := c.GetString(middleware.ContextKeyEmail)
	insts, err := h.ec2Svc.ListInstancesForAccount(c.Request.Context(), *acc, email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if insts == nil {
		insts = []model.EC2Instance{}
	}
	c.JSON(http.StatusOK, insts)
}

// GET /api/admin/projects/:id/members — admin or project admin lists members
func (h *ProjectsHandler) ListMembers(c *gin.Context) {
	projectID := c.Param("id")
	if err := h.requireProjectAdminOrGlobalAdmin(c, projectID); err != nil {
		return
	}
	members, err := h.db.ListProjectMembers(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if members == nil {
		members = []model.ProjectMember{}
	}
	c.JSON(http.StatusOK, members)
}

// POST /api/projects/:id/members — project admin or global admin adds a member
func (h *ProjectsHandler) AddMember(c *gin.Context) {
	projectID := c.Param("id")
	if err := h.requireProjectAdminOrGlobalAdmin(c, projectID); err != nil {
		return
	}
	var body model.AddProjectMemberBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role := body.Role
	if role != "admin" {
		role = "member"
	}
	user, err := h.db.GetUser(c.Request.Context(), body.UserID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	addedBy := c.GetString(middleware.ContextKeyUserID)
	m := model.ProjectMember{
		ProjectID: projectID,
		UserID:    body.UserID,
		Role:      role,
		AddedBy:   addedBy,
		UserName:  user.DisplayName,
	}
	if err := h.db.AddProjectMember(c.Request.Context(), m); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, m)
}

// DELETE /api/projects/:id/members/:userId — project admin or global admin removes a member
func (h *ProjectsHandler) RemoveMember(c *gin.Context) {
	projectID := c.Param("id")
	if err := h.requireProjectAdminOrGlobalAdmin(c, projectID); err != nil {
		return
	}
	if err := h.db.RemoveProjectMember(c.Request.Context(), projectID, c.Param("userId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "removed"})
}

// GET /api/projects/:id/requests — project admin lists requests for their project
func (h *ProjectsHandler) ListRequests(c *gin.Context) {
	projectID := c.Param("id")
	if err := h.requireProjectAdminOrGlobalAdmin(c, projectID); err != nil {
		return
	}
	statusFilter := c.Query("status")
	requests, err := h.db.ListRequestsByProject(c.Request.Context(), projectID, statusFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if requests == nil {
		requests = []model.RestartRequest{}
	}
	c.JSON(http.StatusOK, requests)
}

// POST /api/projects/:id/requests/approve — project admin approves with TOTP
func (h *ProjectsHandler) ApproveRequest(c *gin.Context) {
	projectID := c.Param("id")
	if err := h.requireProjectAdminOrGlobalAdmin(c, projectID); err != nil {
		return
	}

	var body model.ApproveWithOTPBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString(middleware.ContextKeyUserID)

	// Dev bypass
	authHeader := c.GetHeader("Authorization")
	if gin.Mode() != gin.ReleaseMode && authHeader == "Bearer dev-mock-token" {
		log.Printf("[TOTP] Dev mode — skipping TOTP for project admin %s", userID)
	} else {
		user, err := h.db.GetUser(c.Request.Context(), userID)
		if err != nil || user == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		if !user.TOTPEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "TOTP not set up. Go to Settings to enable 2FA first."})
			return
		}
		if !totp.Validate(body.TOTPCode, user.TOTPSecret) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid TOTP code"})
			return
		}
	}

	req, err := h.db.GetRequest(c.Request.Context(), body.RequestID)
	if err != nil || req == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}
	if req.Status != model.StatusPending {
		c.JSON(http.StatusConflict, gin.H{"error": "request is not pending"})
		return
	}
	if req.ProjectID != projectID {
		c.JSON(http.StatusForbidden, gin.H{"error": "request does not belong to this project"})
		return
	}

	op := req.Operation
	if op == "" {
		op = model.OperationReboot
	}

	blocked, err := h.db.CheckBlackout(c.Request.Context(), "", op)
	if err == nil && blocked != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"error":      "operation blocked by blackout window",
			"windowName": blocked.Name,
			"reason":     blocked.Reason,
		})
		return
	}

	email := c.GetString(middleware.ContextKeyEmail)
	var execErr error
	if req.AccountID != "" {
		acc, err := h.db.GetAWSAccount(c.Request.Context(), req.AccountID)
		if err != nil || acc == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "account not found"})
			return
		}
		execErr = h.ec2Svc.ExecuteOperationWithRole(c.Request.Context(), req.InstanceID, req.Region, op, *acc, email)
	} else {
		execErr = h.ec2Svc.ExecuteOperation(c.Request.Context(), req.InstanceID, req.Region, op)
	}
	if execErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": string(op) + " failed: " + execErr.Error()})
		return
	}

	displayName := c.GetString(middleware.ContextKeyUserName)
	if err := h.db.ApproveRequest(c.Request.Context(), body.RequestID, userID, displayName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[APPROVE] project admin %s approved request %s", userID, body.RequestID)
	c.JSON(http.StatusOK, gin.H{"message": string(op) + " approved and executed"})
}

// POST /api/projects/:id/requests/deny — project admin denies a request
func (h *ProjectsHandler) DenyRequest(c *gin.Context) {
	projectID := c.Param("id")
	if err := h.requireProjectAdminOrGlobalAdmin(c, projectID); err != nil {
		return
	}

	var body model.DenyRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req, err := h.db.GetRequest(c.Request.Context(), body.RequestID)
	if err != nil || req == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}
	if req.Status != model.StatusPending {
		c.JSON(http.StatusConflict, gin.H{"error": "request is not pending"})
		return
	}
	if req.ProjectID != projectID {
		c.JSON(http.StatusForbidden, gin.H{"error": "request does not belong to this project"})
		return
	}

	if err := h.db.UpdateRequestStatus(c.Request.Context(), body.RequestID, model.StatusDenied, body.DenyReason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "denied"})
}

// requireProjectAdminOrGlobalAdmin checks that the caller is either a global admin/root
// OR a project admin for the given project. Returns a non-nil error and writes the
// HTTP response if the check fails.
func (h *ProjectsHandler) requireProjectAdminOrGlobalAdmin(c *gin.Context, projectID string) error {
	role := c.GetString(middleware.ContextKeyRole)
	if role == string(model.RoleAdmin) || role == string(model.RoleRoot) {
		return nil
	}
	userID := c.GetString(middleware.ContextKeyUserID)
	m, err := h.db.GetProjectMember(c.Request.Context(), projectID, userID)
	if err != nil || m == nil || m.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "project admin access required"})
		return errForbidden
	}
	return nil
}

var errForbidden = &forbiddenErr{}

type forbiddenErr struct{}

func (e *forbiddenErr) Error() string { return "forbidden" }
