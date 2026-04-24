package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

type BlackoutHandler struct {
	db *service.DynamoDBService
}

func NewBlackoutHandler(db *service.DynamoDBService) *BlackoutHandler {
	return &BlackoutHandler{db: db}
}

// GET /api/admin/blackout
func (h *BlackoutHandler) List(c *gin.Context) {
	windows, err := h.db.ListBlackoutWindows(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, windows)
}

// POST /api/root/blackout
func (h *BlackoutHandler) Create(c *gin.Context) {
	var body model.BlackoutWindowBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	createdBy, _ := c.Get(middleware.ContextKeyUserID)
	w := model.BlackoutWindow{
		Name:       body.Name,
		StartTime:  body.StartTime,
		EndTime:    body.EndTime,
		Timezone:   body.Timezone,
		DaysOfWeek: body.DaysOfWeek,
		Scope:      body.Scope,
		Reason:     body.Reason,
		CreatedBy:  createdBy.(string),
	}
	created, err := h.db.CreateBlackoutWindow(c.Request.Context(), w)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

// PUT /api/root/blackout/:id
func (h *BlackoutHandler) Update(c *gin.Context) {
	var body model.BlackoutWindowBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.db.UpdateBlackoutWindow(c.Request.Context(), c.Param("id"), body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

// DELETE /api/root/blackout/:id
func (h *BlackoutHandler) Delete(c *gin.Context) {
	if err := h.db.DeleteBlackoutWindow(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// PATCH /api/root/blackout/:id/toggle
func (h *BlackoutHandler) Toggle(c *gin.Context) {
	activeStr := c.Query("active")
	active, err := strconv.ParseBool(activeStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "active must be true or false"})
		return
	}
	if err := h.db.ToggleBlackoutWindow(c.Request.Context(), c.Param("id"), active); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"active": active})
}
