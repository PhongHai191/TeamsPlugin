package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
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

// jwks is initialised once at startup and auto-refreshes its cache.
var jwks keyfunc.Keyfunc

func init() {
	var err error
	jwks, err = keyfunc.NewDefaultCtx(context.Background(),
		[]string{"https://login.microsoftonline.com/common/discovery/v2.0/keys"})
	if err != nil {
		// Non-fatal at startup — will fail on first real token verification
		_ = err
	}
}

// TeamsAuth validates the Teams SSO JWT and injects user info into context.
func TeamsAuth(db *service.DynamoDBService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		// Dev bypass
		if os.Getenv("DEV_ROLE") != "" && strings.HasPrefix(tokenStr, "dev-mock-token") {
			role := strings.TrimPrefix(tokenStr, "dev-mock-token-")
			if role == "dev-mock-token" || role == "" {
				role = os.Getenv("DEV_ROLE")
			}
			userID := "dev-user-" + role
			displayName := "Demo (" + role + ")"
			email := role + "@example.com"

			// Ensure dev user exists in DynamoDB so they appear in user lists and can be added to projects.
			// Ignore errors (DynamoDB may be unavailable in fully offline dev).
			if _, err := db.GetOrCreateUser(context.Background(), userID, displayName, email); err != nil {
				_ = err
			}

			c.Set(ContextKeyUserID, userID)
			c.Set(ContextKeyUserName, displayName)
			c.Set(ContextKeyEmail, email)
			c.Set(ContextKeyRole, role)
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

// RequireAdmin aborts if the caller is not admin or root.
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(ContextKeyRole)
		if role != string(model.RoleAdmin) && role != string(model.RoleRoot) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin only"})
			return
		}
		c.Next()
	}
}

// RequireRoot aborts if the caller is not root.
func RequireRoot() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(ContextKeyRole)
		if role != string(model.RoleRoot) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "root only"})
			return
		}
		c.Next()
	}
}

func parseTeamsToken(tokenStr string) (*model.TeamsTokenClaims, error) {
	clientID := os.Getenv("AZURE_AD_CLIENT_ID")

	var token *jwt.Token
	var err error

	if clientID != "" && jwks != nil {
		// Teams SSO tokens use the Application ID URI as audience:
		// api://<domain>/<clientId>  — check both forms.
		appURI := os.Getenv("AZURE_AD_APP_URI") // e.g. api://fragrant-sun-4b45.hieulun76a.workers.dev/<clientId>
		audience := clientID
		if appURI != "" {
			audience = appURI
		}
		token, err = jwt.Parse(tokenStr, jwks.Keyfunc,
			jwt.WithValidMethods([]string{"RS256"}),
			jwt.WithAudience(audience),
		)
	} else {
		// Dev/demo: no client ID configured, skip signature verification
		parser := jwt.NewParser(jwt.WithoutClaimsValidation())
		token, _, err = parser.ParseUnverified(tokenStr, jwt.MapClaims{})
	}

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
		OID:               oid,
		Name:              name,
		PreferredUsername: email,
	}, nil
}
