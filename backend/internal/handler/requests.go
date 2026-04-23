package handler

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type RequestsHandler struct {
	db     *service.DynamoDBService
	ec2Svc *service.EC2Service
}

func NewRequestsHandler(db *service.DynamoDBService, ec2Svc *service.EC2Service) *RequestsHandler {
	return &RequestsHandler{db: db, ec2Svc: ec2Svc}
}

// POST /api/requests — employee creates a restart request
func (h *RequestsHandler) CreateRequest(c *gin.Context) {
	var body model.CreateRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(strings.TrimSpace(body.Reason)) < 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason must be at least 5 characters"})
		return
	}

	userID, _ := c.Get(middleware.ContextKeyUserID)
	userName, _ := c.Get(middleware.ContextKeyUserName)

	req := model.RestartRequest{
		UserID:       userID.(string),
		UserName:     userName.(string),
		InstanceID:   body.InstanceID,
		InstanceName: body.InstanceName,
		Region:       body.Region,
		Reason:       body.Reason,
	}
	created, err := h.db.CreateRequest(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

// GET /api/requests/me — employee lists their own requests
func (h *RequestsHandler) ListMyRequests(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)
	requests, err := h.db.ListRequestsByUser(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, requests)
}

// GET /api/admin/requests — admin lists all requests
func (h *RequestsHandler) ListAllRequests(c *gin.Context) {
	statusFilter := c.Query("status")
	requests, err := h.db.ListAllRequests(c.Request.Context(), statusFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, requests)
}

// POST /api/admin/requests/approve — admin approves and triggers EC2 reboot
func (h *RequestsHandler) ApproveRequest(c *gin.Context) {
	var body model.ApproveRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req, err := h.db.GetRequest(c.Request.Context(), body.RequestID)
	if err != nil || req == nil {
		log.Printf("[APPROVE] Request %s not found: %v", body.RequestID, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}
	log.Printf("[APPROVE] Found request %s — instance=%s status=%s", body.RequestID, req.InstanceID, req.Status)

	if req.Status != model.StatusPending {
		c.JSON(http.StatusConflict, gin.H{"error": "request is not pending"})
		return
	}

	log.Printf("[APPROVE] Calling EC2 reboot for instance %s", req.InstanceID)
	if err := h.ec2Svc.RebootInstance(c.Request.Context(), req.InstanceID, req.Region); err != nil {
		log.Printf("[APPROVE] EC2 reboot FAILED: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ec2 reboot failed: " + err.Error()})
		return
	}
	log.Printf("[APPROVE] EC2 reboot call succeeded, updating DB status")

	if err := h.db.UpdateRequestStatus(c.Request.Context(), body.RequestID, model.StatusApproved, ""); err != nil {
		log.Printf("[APPROVE] DB update FAILED: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[APPROVE] Done — request %s approved and instance %s rebooted", body.RequestID, req.InstanceID)
	c.JSON(http.StatusOK, gin.H{"message": "approved and rebooted"})
}

// POST /api/admin/requests/deny — admin denies with reason
func (h *RequestsHandler) DenyRequest(c *gin.Context) {
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

	if err := h.db.UpdateRequestStatus(c.Request.Context(), body.RequestID, model.StatusDenied, body.DenyReason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "denied"})
}
