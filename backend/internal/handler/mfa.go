package handler

import (
	"log"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type MFAHandler struct {
	db     *service.DynamoDBService
	ec2Svc *service.EC2Service
}

func NewMFAHandler(db *service.DynamoDBService, ec2Svc *service.EC2Service) *MFAHandler {
	return &MFAHandler{db: db, ec2Svc: ec2Svc}
}

// POST /api/admin/mfa/challenge
// Creates a number-matching challenge for the given requestId.
// Returns {challengeId, displayNumber} to show on the desktop.
func (h *MFAHandler) CreateChallenge(c *gin.Context) {
	var body model.CreateMFAChallengeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	adminID, _ := c.Get(middleware.ContextKeyUserID)

	req, err := h.db.GetRequest(c.Request.Context(), body.RequestID)
	if err != nil || req == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}
	if req.Status != model.StatusPending {
		c.JSON(http.StatusConflict, gin.H{"error": "request is not pending"})
		return
	}

	display := rand.Intn(90) + 10 // 10–99
	opts := generateOptions(display)

	challenge := model.MFAChallenge{
		ChallengeID:    uuid.NewString(),
		RequestID:      req.RequestID,
		AdminID:        adminID.(string),
		InstanceID:     req.InstanceID,
		InstanceName:   req.InstanceName,
		InstanceRegion: req.Region,
		RequestedBy:    req.UserName,
		DisplayNumber:  display,
		Options:        opts,
		Status:         "pending",
		ExpiresAt:      time.Now().Add(2 * time.Minute).Unix(),
	}

	if err := h.db.CreateMFAChallenge(c.Request.Context(), challenge); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create challenge"})
		return
	}

	log.Printf("[MFA] Challenge created by %s for request %s", adminID, req.RequestID)
	c.JSON(http.StatusOK, gin.H{
		"challengeId":   challenge.ChallengeID,
		"displayNumber": display,
	})
}

// GET /api/admin/mfa/pending
// Phone polls this to find if there is a pending challenge waiting for the current admin.
// Returns options but NOT the display number (admin must read that from the desktop).
func (h *MFAHandler) GetPending(c *gin.Context) {
	adminID, _ := c.Get(middleware.ContextKeyUserID)

	ch, err := h.db.GetPendingChallengeForAdmin(c.Request.Context(), adminID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if ch == nil {
		c.JSON(http.StatusOK, gin.H{"pending": false})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pending":      true,
		"challengeId":  ch.ChallengeID,
		"options":      ch.Options,
		"instanceName": ch.InstanceName,
		"requestedBy":  ch.RequestedBy,
	})
}

// GET /api/admin/mfa/challenge/:id/status
// Desktop polls this to know when the phone has approved.
func (h *MFAHandler) GetStatus(c *gin.Context) {
	challengeID := c.Param("id")
	ch, err := h.db.GetMFAChallenge(c.Request.Context(), challengeID)
	if err != nil || ch == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "challenge not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":       ch.Status,
		"errorMessage": ch.ErrorMessage,
	})
}

// POST /api/admin/mfa/challenge/:id/verify
// Phone submits the selected number. If correct, reboots the server.
func (h *MFAHandler) Verify(c *gin.Context) {
	challengeID := c.Param("id")

	var body model.VerifyMFAChallengeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	adminID, _ := c.Get(middleware.ContextKeyUserID)

	ch, err := h.db.GetMFAChallenge(c.Request.Context(), challengeID)
	if err != nil || ch == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "challenge not found or expired"})
		return
	}
	if ch.AdminID != adminID.(string) {
		c.JSON(http.StatusForbidden, gin.H{"error": "challenge belongs to a different admin"})
		return
	}
	if ch.Status != "pending" {
		c.JSON(http.StatusConflict, gin.H{"error": "challenge already resolved"})
		return
	}
	if time.Now().Unix() > ch.ExpiresAt {
		_ = h.db.ResolveMFAChallenge(c.Request.Context(), challengeID, "failed", "expired")
		c.JSON(http.StatusGone, gin.H{"error": "challenge expired"})
		return
	}
	if body.SelectedNumber != ch.DisplayNumber {
		_ = h.db.ResolveMFAChallenge(c.Request.Context(), challengeID, "failed", "wrong number")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wrong number"})
		return
	}

	// Verify the request is still pending before rebooting
	req, err := h.db.GetRequest(c.Request.Context(), ch.RequestID)
	if err != nil || req == nil || req.Status != model.StatusPending {
		_ = h.db.ResolveMFAChallenge(c.Request.Context(), challengeID, "failed", "request no longer pending")
		c.JSON(http.StatusConflict, gin.H{"error": "request is no longer pending"})
		return
	}

	log.Printf("[MFA] Number matched by %s — rebooting %s", adminID, ch.InstanceID)
	if err := h.ec2Svc.RebootInstance(c.Request.Context(), ch.InstanceID, ch.InstanceRegion); err != nil {
		_ = h.db.ResolveMFAChallenge(c.Request.Context(), challengeID, "failed", err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reboot failed: " + err.Error()})
		return
	}

	_ = h.db.ApproveRequest(c.Request.Context(), ch.RequestID, adminID.(string), "")
	_ = h.db.ResolveMFAChallenge(c.Request.Context(), challengeID, "approved", "")
	log.Printf("[MFA] Approved — request %s by %s", ch.RequestID, adminID)
	c.JSON(http.StatusOK, gin.H{"message": "approved and rebooted"})
}

func generateOptions(display int) []int {
	seen := map[int]bool{display: true}
	opts := []int{display}
	for len(opts) < 3 {
		n := rand.Intn(90) + 10
		if !seen[n] {
			seen[n] = true
			opts = append(opts, n)
		}
	}
	rand.Shuffle(len(opts), func(i, j int) { opts[i], opts[j] = opts[j], opts[i] })
	return opts
}
