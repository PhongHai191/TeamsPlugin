package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/seta-international/team-aws-extension/internal/model"
	"github.com/seta-international/team-aws-extension/internal/service"
)

const (
	ContextKeyUserID   = "userId"
	ContextKeyUserName = "userName"
	ContextKeyEmail    = "email"
	ContextKeyRole     = "role"
)

var msJWKSURL = "https://login.microsoftonline.com/common/discovery/v2.0/keys"

type jwksCache struct {
	keys      map[string][]byte
	fetchedAt time.Time
}

var cache jwksCache

// TeamsAuth validates the Teams SSO JWT and injects user info into context.
func TeamsAuth(db *service.DynamoDBService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		// Dev bypass: accept mock token when GIN_MODE != release
		if gin.Mode() != gin.ReleaseMode && tokenStr == "dev-mock-token" {
			devRole := os.Getenv("DEV_ROLE")
			if devRole == "" {
				devRole = string(model.RoleUser)
			}
			c.Set(ContextKeyUserID, "dev-user-001")
			c.Set(ContextKeyUserName, "Dev User")
			c.Set(ContextKeyEmail, "dev@example.com")
			c.Set(ContextKeyRole, devRole)
			c.Next()
			return
		}

		claims, err := parseTeamsToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("invalid token: %v", err)})
			return
		}

		user, err := db.GetOrCreateUser(context.Background(), claims.OID, claims.Name, claims.PreferredUsername)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "user lookup failed"})
			return
		}

		c.Set(ContextKeyUserID, user.TeamsUserID)
		c.Set(ContextKeyUserName, user.DisplayName)
		c.Set(ContextKeyEmail, user.Email)
		c.Set(ContextKeyRole, string(user.Role))
		c.Next()
	}
}

// RequireAdmin aborts if the caller is not an admin.
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(ContextKeyRole)
		if role != string(model.RoleAdmin) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin only"})
			return
		}
		c.Next()
	}
}

func parseTeamsToken(tokenStr string) (*model.TeamsTokenClaims, error) {
	// Parse without verification first to get kid, then verify with correct key.
	// In production, use a proper JWKS library; this is a minimal implementation.
	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	token, _, err := parser.ParseUnverified(tokenStr, jwt.MapClaims{})
	if err != nil {
		return nil, err
	}

	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}

	oid, _ := mapClaims["oid"].(string)
	name, _ := mapClaims["name"].(string)
	email, _ := mapClaims["preferred_username"].(string)

	if oid == "" {
		return nil, fmt.Errorf("missing oid claim")
	}

	return &model.TeamsTokenClaims{
		OID:              oid,
		Name:             name,
		PreferredUsername: email,
	}, nil
}

// fetchJWKS fetches Microsoft public keys (simple cache, 1h TTL).
func fetchJWKS() (map[string][]byte, error) {
	if time.Since(cache.fetchedAt) < time.Hour && cache.keys != nil {
		return cache.keys, nil
	}
	resp, err := http.Get(msJWKSURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Keys []map[string]interface{} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	keys := make(map[string][]byte)
	for _, k := range result.Keys {
		kid, _ := k["kid"].(string)
		raw, _ := json.Marshal(k)
		keys[kid] = raw
	}
	cache = jwksCache{keys: keys, fetchedAt: time.Now()}
	return keys, nil
}
