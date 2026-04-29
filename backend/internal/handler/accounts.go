package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type AccountsHandler struct {
	db     *service.DynamoDBService
	ec2Svc *service.EC2Service
}

func NewAccountsHandler(db *service.DynamoDBService, ec2Svc *service.EC2Service) *AccountsHandler {
	return &AccountsHandler{db: db, ec2Svc: ec2Svc}
}

// GET /api/root/accounts
func (h *AccountsHandler) List(c *gin.Context) {
	accounts, err := h.db.ListAWSAccounts(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, accounts)
}

// POST /api/root/accounts
func (h *AccountsHandler) Create(c *gin.Context) {
	var body model.AWSAccountBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	addedBy, _ := c.Get(middleware.ContextKeyUserID)
	acc := model.AWSAccount{
		AccountID:  body.AccountID,
		Alias:      body.Alias,
		RoleARN:    body.RoleARN,
		ExternalID: body.ExternalID,
		Regions:    body.Regions,
		Project:    body.Project,
		AddedAt:    time.Now().UTC().Format(time.RFC3339),
		AddedBy:    addedBy.(string),
	}
	created, err := h.db.CreateAWSAccount(c.Request.Context(), acc)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "account already exists or " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

// DELETE /api/root/accounts/:id
func (h *AccountsHandler) Delete(c *gin.Context) {
	if err := h.db.DeleteAWSAccount(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// POST /api/root/accounts/generate-external-id — helper to generate a UUID for ExternalId
func (h *AccountsHandler) GenerateExternalID(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"externalId": uuid.NewString()})
}
