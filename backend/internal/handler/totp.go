package handler

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

const issuer = "TeamAWSExtension"

type TOTPHandler struct {
	db     *service.DynamoDBService
	ec2Svc *service.EC2Service
}

func NewTOTPHandler(db *service.DynamoDBService, ec2Svc *service.EC2Service) *TOTPHandler {
	return &TOTPHandler{db: db, ec2Svc: ec2Svc}
}

// GET /api/admin/totp/setup
// Returns existing QR if secret already exists (not yet enabled), or generates a new one.
// Once totpEnabled=true, refuses to regenerate to protect the active secret.
func (h *TOTPHandler) Setup(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)
	displayName, _ := c.Get(middleware.ContextKeyUserName)

	user, err := h.db.GetUser(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user lookup failed"})
		return
	}

	if user != nil && user.TOTPEnabled {
		c.JSON(http.StatusConflict, gin.H{"error": "2FA already active — disable it before re-linking"})
		return
	}

	// Reuse existing unverified secret so re-opening the modal shows the same QR
	if user != nil && user.TOTPSecret != "" {
		key, err := otp.NewKeyFromURL(
			"otpauth://totp/" + issuer + ":" + displayName.(string) + "?secret=" + user.TOTPSecret + "&issuer=" + issuer,
		)
		if err == nil {
			c.JSON(http.StatusOK, model.TOTPSetupResponse{OtpauthURL: key.URL(), Secret: user.TOTPSecret})
			return
		}
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: displayName.(string),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate TOTP secret"})
		return
	}
	if err := h.db.SaveTOTPSecret(c.Request.Context(), userID.(string), key.Secret()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save TOTP secret"})
		return
	}
	log.Printf("[TOTP] New secret generated for user %s", userID)
	c.JSON(http.StatusOK, model.TOTPSetupResponse{OtpauthURL: key.URL(), Secret: key.Secret()})
}

// POST /api/admin/totp/verify-setup
// Verifies the first TOTP code to confirm the admin scanned correctly, then enables TOTP.
func (h *TOTPHandler) VerifySetup(c *gin.Context) {
	var body model.TOTPVerifySetupBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get(middleware.ContextKeyUserID)
	user, err := h.db.GetUser(c.Request.Context(), userID.(string))
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.TOTPSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "TOTP setup not initiated, call /totp/setup first"})
		return
	}

	if !totp.Validate(body.Code, user.TOTPSecret) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid code"})
		return
	}

	if err := h.db.EnableTOTP(c.Request.Context(), userID.(string)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enable TOTP"})
		return
	}

	log.Printf("[TOTP] Enabled for user %s", userID)
	c.JSON(http.StatusOK, gin.H{"message": "TOTP enabled"})
}

// POST /api/admin/totp/reset
// Clears the existing TOTP secret so the admin can re-link a new authenticator.
func (h *TOTPHandler) Reset(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)
	if err := h.db.ClearTOTPSecret(c.Request.Context(), userID.(string)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset TOTP"})
		return
	}
	log.Printf("[TOTP] Reset by user %s", userID)
	c.JSON(http.StatusOK, gin.H{"message": "TOTP reset — you can now set up a new authenticator"})
}

// POST /api/admin/requests/approve (replaces the original handler)
// Requires a valid TOTP code before rebooting.
func (h *TOTPHandler) ApproveWithOTP(c *gin.Context) {
	var body model.ApproveWithOTPBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get(middleware.ContextKeyUserID)

	// Dev bypass: skip TOTP when token is mock
	authHeader := c.GetHeader("Authorization")
	if gin.Mode() != gin.ReleaseMode && authHeader == "Bearer dev-mock-token" {
		log.Printf("[TOTP] Dev mode — skipping TOTP verification for user %s", userID)
	} else {
		user, err := h.db.GetUser(c.Request.Context(), userID.(string))
		if err != nil || user == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		if !user.TOTPEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "TOTP not set up. Go to Settings to enable 2FA first."})
			return
		}
		if !totp.Validate(body.TOTPCode, user.TOTPSecret) {
			log.Printf("[TOTP] Invalid code from user %s", userID)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid TOTP code"})
			return
		}
	}

	// Delegate to shared approve logic
	req, err := h.db.GetRequest(c.Request.Context(), body.RequestID)
	if err != nil || req == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}
	if req.Status != model.StatusPending {
		c.JSON(http.StatusConflict, gin.H{"error": "request is not pending"})
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

	log.Printf("[APPROVE] TOTP verified — executing %s on %s", op, req.InstanceID)

	userEmail, _ := c.Get(middleware.ContextKeyEmail)
	email, _ := userEmail.(string)

	var execErr error
	if req.AccountID != "" {
		acc, err := h.db.GetAWSAccount(c.Request.Context(), req.AccountID)
		if err != nil || acc == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "account not found: " + req.AccountID})
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
	displayName, _ := c.Get(middleware.ContextKeyUserName)
	approvedByName, _ := displayName.(string)
	if err := h.db.ApproveRequest(c.Request.Context(), body.RequestID, userID.(string), approvedByName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[APPROVE] Done — request %s approved by %s", body.RequestID, userID)
	c.JSON(http.StatusOK, gin.H{"message": string(op) + " approved and executed"})
}
