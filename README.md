# TeamAWSExtension

Microsoft Teams Tab App for managing AWS EC2 server restart requests.

Employees submit restart requests through a Teams dashboard. Admins review, approve (triggering an actual EC2 reboot via AWS SDK), or deny requests with a reason. All parties see real-time status updates.

---

## Features

- **Employee**: Request restart for any tagged EC2 instance, view request history with status (pending / approved / denied) and denial reason
- **Admin**: View all requests, filter by status, approve with one click (auto-reboots EC2), or deny with a typed reason
- **Auth**: Teams SSO — no separate login required; roles managed in DynamoDB
- **UI**: Fluent UI v9 — looks and feels native inside Microsoft Teams

---

## Architecture

```
Teams Tab (React + Vite)
        │
        │  Teams SSO token (JWT)
        ▼
Go API Server (Gin)
        │
        ├── DynamoDB ── users, restart-requests
        └── AWS EC2 ── DescribeInstances, RebootInstances
```

---

## Prerequisites

- Node.js 18+
- Go 1.21+
- AWS account with DynamoDB tables and EC2 instances tagged `Restartable=true`
- Microsoft Azure AD App Registration (for Teams SSO)

---

## Quick Start

### 1. AWS Setup

Create DynamoDB tables:

```bash
# users table
aws dynamodb create-table \
  --table-name users \
  --attribute-definitions AttributeName=teamsUserId,AttributeType=S \
  --key-schema AttributeName=teamsUserId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# restart-requests table
aws dynamodb create-table \
  --table-name restart-requests \
  --attribute-definitions \
    AttributeName=requestId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=requestId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName": "userId-createdAt-index",
    "KeySchema": [
      {"AttributeName":"userId","KeyType":"HASH"},
      {"AttributeName":"createdAt","KeyType":"RANGE"}
    ],
    "Projection": {"ProjectionType":"ALL"}
  }]'
```

Tag EC2 instances to make them available in the app:

```bash
aws ec2 create-tags --resources i-xxxxxxxxxxxxxxxxx --tags Key=Restartable,Value=true
```

Promote a user to admin (after they log in once):

```bash
aws dynamodb update-item \
  --table-name users \
  --key '{"teamsUserId": {"S": "<teams-oid>"}}' \
  --update-expression "SET #r = :admin" \
  --expression-attribute-names '{"#r": "role"}' \
  --expression-attribute-values '{":admin": {"S": "admin"}}'
```

### 2. Backend

```bash
cd backend
export AWS_REGION=ap-southeast-1
export FRONTEND_URL=http://localhost:5173   # or your deployed URL
go run ./cmd/server
```

Server starts on `:8080`.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# Optionally set VITE_DEV_ROLE=admin to test admin view without Teams
npm run dev
```

App runs on `http://localhost:5173`. API calls are proxied to `:8080`.

---

## Deploying to Production

### Frontend
Build and upload to S3 + CloudFront (must be HTTPS for Teams):

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
```

### Backend
Build and run on EC2 or as a Lambda behind API Gateway:

```bash
cd backend
go build -o bin/server ./cmd/server
```

### Teams App
1. Fill in `teams/manifest.json` placeholders (`{{TEAMS_APP_ID}}`, `{{FRONTEND_URL}}`, etc.)
2. Zip the `teams/` folder: `manifest.json`, `color.png`, `outline.png`
3. Upload to Microsoft Teams Admin Center or sideload via Developer Portal

---

## Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `AWS_REGION` | `ap-southeast-1` | AWS region |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `PORT` | `8080` | HTTP port |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL (default: `http://localhost:8080/api`) |
| `VITE_DEV_ROLE` | `user` or `admin` — mock role for local dev outside Teams |

---

## Project Structure

```
TeamAWSExtension/
├── backend/
│   ├── cmd/server/main.go          # Entry point, routes
│   └── internal/
│       ├── handler/
│       │   ├── ec2.go              # GET /api/ec2/instances
│       │   └── requests.go         # CRUD for restart requests
│       ├── middleware/
│       │   └── auth.go             # Teams JWT validation + role check
│       ├── model/
│       │   └── types.go            # Shared types and DTOs
│       └── service/
│           ├── dynamodb.go         # DynamoDB operations
│           └── ec2.go              # EC2 list + reboot
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── DenyReasonModal.tsx
│       │   ├── NewRequestModal.tsx
│       │   └── StatusBadge.tsx
│       ├── hooks/
│       │   ├── useQuery.ts         # Generic async data fetcher
│       │   └── useTeamsAuth.ts     # Teams SSO initialization
│       ├── lib/api.ts              # Axios API client
│       ├── pages/
│       │   ├── AdminDashboard.tsx
│       │   └── EmployeeDashboard.tsx
│       ├── types/index.ts
│       └── App.tsx                 # Role-based routing
└── teams/
    └── manifest.json               # Teams App manifest (fill placeholders)
```
