package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	ginadapter "github.com/awslabs/aws-lambda-go-api-proxy/gin"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/seta-international/team-aws-extension/internal/handler"
	"github.com/seta-international/team-aws-extension/internal/middleware"
	"github.com/seta-international/team-aws-extension/internal/service"
)

var ginLambda *ginadapter.GinLambdaV2

func main() {
	awsCfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(getEnv("APP_REGION", "us-west-2")),
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
	mfaHandler := handler.NewMFAHandler(dbSvc, ec2Svc)

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "OPTIONS", "PUT", "DELETE"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:   []string{"Content-Length"},
	}))

	auth := middleware.TeamsAuth(dbSvc)
	adminOnly := middleware.RequireAdmin()
	rootOnly := middleware.RequireRoot()

	setupRoutes := func(group *gin.RouterGroup) {
		group.POST("/requests", reqHandler.CreateRequest)
		group.GET("/requests/me", reqHandler.ListMyRequests)
		group.GET("/ec2/instances", ec2Handler.ListInstances)

		admin := group.Group("/admin", adminOnly)
		{
			admin.GET("/requests", reqHandler.ListAllRequests)
			admin.POST("/requests/approve", totpHandler.ApproveWithOTP)
			admin.POST("/requests/deny", reqHandler.DenyRequest)
			admin.GET("/ec2/:instanceId/reboot-history", ec2Handler.GetRebootHistory)
			admin.GET("/users", usersHandler.ListUsers)
			admin.GET("/totp/setup", totpHandler.Setup)
			admin.POST("/totp/verify-setup", totpHandler.VerifySetup)
			admin.POST("/totp/reset", totpHandler.Reset)
			admin.POST("/mfa/challenge", mfaHandler.CreateChallenge)
			admin.GET("/mfa/pending", mfaHandler.GetPending)
			admin.GET("/mfa/challenge/:id/status", mfaHandler.GetStatus)
			admin.POST("/mfa/challenge/:id/verify", mfaHandler.Verify)
		}

		root := group.Group("/root", rootOnly)
		{
			root.POST("/users/role", usersHandler.UpdateUserRole)
		}
	}

	api := r.Group("/api", auth)
	setupRoutes(api)

	root := r.Group("/", auth)
	setupRoutes(root)

	if os.Getenv("LAMBDA_TASK_ROOT") != "" {
		ginLambda = ginadapter.NewV2(r)
		lambda.Start(Handler)
	} else {
		port := getEnv("PORT", "8081")
		log.Printf("server listening on :%s", port)
		if err := r.Run(":" + port); err != nil {
			log.Fatal(err)
		}
	}
}

func Handler(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	p := req.RawPath
	p = strings.TrimPrefix(p, "/default")
	p = strings.TrimPrefix(p, "/teams-aws-backend")
	if p == "" {
		p = "/"
	}
	req.RawPath = p
	req.RequestContext.HTTP.Path = p

	return ginLambda.ProxyWithContext(ctx, req)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
