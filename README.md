# TeamAWSExtension

Microsoft Teams Tab App for managing AWS EC2 server restart requests with role-based access control and TOTP-protected approvals.

---

## Features

- **Employee**: Request restart for tagged EC2 instances, track request status (pending / approved / denied) with denial reason
- **Admin**: View all requests, approve (requires TOTP code → auto-reboots EC2) or deny with reason, view EC2 reboot history from CloudTrail, view users with role `user`
- **Root**: All admin permissions + manage user roles (promote user → admin, demote admin → user), view all users
- **TOTP 2FA**: Admin/root must set up Google Authenticator before they can approve any request
- **UI**: Fluent UI v9 — native Teams look and feel

---

## Architecture

```
Teams Tab (React + Vite)
        │
        │  Teams SSO token (JWT)
        ▼
Go API Server (Gin) — port 8081
        │
        ├── DynamoDB ── users, restart-requests
        ├── AWS EC2  ── DescribeInstances, RebootInstances
        └── CloudTrail── LookupEvents (reboot history)
```

---

## Roles

| Role | What they can do |
|------|-----------------|
| `user` | Submit restart requests, view own requests |
| `admin` | View/approve (TOTP required)/deny all requests, view EC2 logs, view users |
| `root` | All admin permissions + promote/demote users (admin ↔ user) |

> New users are auto-created with role `user` on first login. `root` must be set manually in DynamoDB.

---

## Prerequisites

- Node.js 18+
- Go 1.21+
- AWS account with:
  - DynamoDB tables (`users`, `restart-requests`)
  - EC2 instances tagged `Restartable=true`
  - IAM permissions for EC2, DynamoDB, CloudTrail
- Microsoft Azure AD App Registration (for production Teams SSO)

---

## Quick Start

### 1. AWS Setup

**DynamoDB tables:**

```bash
# users table
aws dynamodb create-table \
  --table-name users \
  --attribute-definitions AttributeName=teamsUserId,AttributeType=S \
  --key-schema AttributeName=teamsUserId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1

# restart-requests table
aws dynamodb create-table \
  --table-name restart-requests \
  --attribute-definitions \
    AttributeName=requestId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=requestId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1 \
  --global-secondary-indexes '[{
    "IndexName": "userId-createdAt-index",
    "KeySchema": [
      {"AttributeName":"userId","KeyType":"HASH"},
      {"AttributeName":"createdAt","KeyType":"RANGE"}
    ],
    "Projection": {"ProjectionType":"ALL"}
  }]'
```

**Tag EC2 instances:**
```bash
aws ec2 create-tags --resources i-xxxxxxxxxxxxxxxxx --tags Key=Restartable,Value=true
```

**Set root user** (after first login):
```bash
aws dynamodb update-item \
  --table-name users \
  --key '{"teamsUserId": {"S": "<teams-oid>"}}' \
  --update-expression "SET #r = :root" \
  --expression-attribute-names '{"#r": "role"}' \
  --expression-attribute-values '{":root": {"S": "root"}}' \
  --region ap-southeast-1
```

### 2. Backend

```bash
cd backend
export AWS_REGION=ap-southeast-1
export FRONTEND_URL=http://localhost:5173
export PORT=8081
export DEV_ROLE=admin   # root | admin | user for local dev
go build -o /tmp/server ./cmd/server && /tmp/server
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm run dev
# Opens at http://localhost:5173
```

**Switch roles without restart** — append URL param:
- `http://localhost:5173?role=root` → Root view
- `http://localhost:5173?role=admin` → Admin view
- `http://localhost:5173?role=user` → Employee view

---

## TOTP Setup (Admin/Root)

First time opening the app as admin/root, a warning banner appears:

1. Click **Set up 2FA**
2. Scan the QR code with **Google Authenticator** or **Authy**
3. Enter the 6-digit code to confirm
4. Done — the Approve button is now active

Each approval requires entering a fresh 6-digit code from the authenticator app.

> **Local dev:** TOTP is automatically bypassed when using the dev mock token.

---

## Deploying to Production

### Frontend — S3 + CloudFront
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-bucket --delete
```

### Backend — EC2 or Lambda
```bash
cd backend
go build -o bin/server ./cmd/server
```

### Teams App
1. Fill placeholders in `teams/manifest.json`
2. Zip: `manifest.json` + `color.png` + `outline.png`
3. Upload to Teams Admin Center or Developer Portal

---

## Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `AWS_REGION` | `ap-southeast-1` | AWS region |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `PORT` | `8080` | HTTP listen port |
| `DEV_ROLE` | `user` | Mock role in dev mode (`root`\|`admin`\|`user`) |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | `/api` for local dev (Vite proxy), full URL for production |
| `VITE_DEV_ROLE` | Fallback mock role if no `?role=` URL param |

---

## Project Structure

```
TeamAWSExtension/
├── backend/
│   ├── cmd/server/main.go              # Entry point, routes
│   └── internal/
│       ├── handler/
│       │   ├── ec2.go                  # EC2 list + reboot history
│       │   ├── requests.go             # CRUD restart requests
│       │   ├── totp.go                 # TOTP setup, verify, approve-with-OTP
│       │   └── users.go                # List users, update role
│       ├── middleware/
│       │   └── auth.go                 # Teams JWT validation, RequireAdmin, RequireRoot
│       ├── model/
│       │   └── types.go                # Shared types and DTOs
│       └── service/
│           ├── dynamodb.go             # DynamoDB operations
│           └── ec2.go                  # EC2 + CloudTrail operations
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ApproveOTPModal.tsx     # TOTP code input before approving
│       │   ├── DenyReasonModal.tsx     # Denial reason input
│       │   ├── EC2LogsModal.tsx        # CloudTrail reboot history
│       │   ├── NewRequestModal.tsx     # Employee request form
│       │   ├── StatusBadge.tsx         # Colored status badge
│       │   └── TOTPSetupModal.tsx      # QR code + verify setup
│       ├── hooks/
│       │   ├── useQuery.ts             # Generic async data fetcher
│       │   └── useTeamsAuth.ts         # Teams SSO + dev fallback
│       ├── lib/api.ts                  # Axios API client
│       ├── pages/
│       │   ├── AdminDashboard.tsx      # Requests table + approve/deny
│       │   ├── EmployeeDashboard.tsx   # My requests + new request
│       │   └── UserManagement.tsx      # User list + role management
│       ├── types/index.ts              # Shared TypeScript types
│       └── App.tsx                     # Auth, role routing, tab navigation
└── teams/
    └── manifest.json                   # Teams App manifest (fill placeholders)
```

---

## AWS IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:DescribeInstances",
      "ec2:RebootInstances",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "cloudtrail:LookupEvents"
    ],
    "Resource": "*"
  }]
}
```
