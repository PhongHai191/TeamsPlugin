package handler

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type UsersHandler struct {
	db *service.DynamoDBService
}

func NewUsersHandler(db *service.DynamoDBService) *UsersHandler {
	return &UsersHandler{db: db}
}

// GET /api/admin/users
// root  → returns all users (admin + user)
// admin → returns only users with role "user"
func (h *UsersHandler) ListUsers(c *gin.Context) {
	callerRole, _ := c.Get(middleware.ContextKeyRole)

	roleFilter := ""
	if callerRole == string(model.RoleAdmin) {
		roleFilter = string(model.RoleUser)
	}

	users, err := h.db.ListUsers(c.Request.Context(), roleFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if users == nil {
		c.JSON(http.StatusOK, []struct{}{})
		return
	}
	c.JSON(http.StatusOK, users)
}

// POST /api/root/users/role — root only
func (h *UsersHandler) UpdateUserRole(c *gin.Context) {
	var body model.UpdateUserRoleBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.Role != model.RoleAdmin && body.Role != model.RoleUser {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be 'admin' or 'user'"})
		return
	}

	callerID, _ := c.Get(middleware.ContextKeyUserID)
	if callerID == body.TeamsUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot change your own role"})
		return
	}

	log.Printf("[USERS] Updating role of %s to %s (by %s)", body.TeamsUserID, body.Role, callerID)
	if err := h.db.UpdateUserRole(c.Request.Context(), body.TeamsUserID, body.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "role updated"})
}
