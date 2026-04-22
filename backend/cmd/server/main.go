package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/handler"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/service"
)

func main() {
	awsCfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(getEnv("AWS_REGION", "ap-southeast-1")),
	)
	if err != nil {
		log.Fatalf("failed to load AWS config: %v", err)
	}

	dbSvc := service.NewDynamoDBService(awsCfg)
	ec2Svc := service.NewEC2Service(awsCfg)

	reqHandler := handler.NewRequestsHandler(dbSvc, ec2Svc)
	ec2Handler := handler.NewEC2Handler(ec2Svc)
	usersHandler := handler.NewUsersHandler(dbSvc)
	totpHandler := handler.NewTOTPHandler(dbSvc, ec2Svc)

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{getEnv("FRONTEND_URL", "http://localhost:5173")},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	auth := middleware.TeamsAuth(dbSvc)
	adminOnly := middleware.RequireAdmin()
	rootOnly := middleware.RequireRoot()

	api := r.Group("/api", auth)
	{
		// Employee endpoints
		api.POST("/requests", reqHandler.CreateRequest)
		api.GET("/requests/me", reqHandler.ListMyRequests)
		api.GET("/ec2/instances", ec2Handler.ListInstances)

		// Admin + Root endpoints
		admin := api.Group("/admin", adminOnly)
		{
			admin.GET("/requests", reqHandler.ListAllRequests)
			admin.POST("/requests/approve", totpHandler.ApproveWithOTP)
			admin.POST("/requests/deny", reqHandler.DenyRequest)
			admin.GET("/ec2/:instanceId/reboot-history", ec2Handler.GetRebootHistory)
			admin.GET("/users", usersHandler.ListUsers)
			admin.GET("/totp/setup", totpHandler.Setup)
			admin.POST("/totp/verify-setup", totpHandler.VerifySetup)
		}

		// Root-only endpoints
		root := api.Group("/root", rootOnly)
		{
			root.POST("/users/role", usersHandler.UpdateUserRole)
		}
	}

	port := getEnv("PORT", "8080")
	log.Printf("server listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
