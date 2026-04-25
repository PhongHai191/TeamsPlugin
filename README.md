# TeamAWSExtension

Microsoft Teams Tab App for managing AWS EC2 server restart requests with role-based access control and TOTP-protected approvals.

---

## Features

- **Employee**: Request reboot/stop/start for tagged EC2 instances, track request status with denial reason
- **Admin**: View all requests, approve (requires TOTP) or deny, view operation history per instance
- **Root**: All admin + manage users, manage AWS accounts, manage blackout windows
- **Multi-Account**: Hub-and-Spoke AssumeRole — manage EC2 across multiple AWS accounts from one app
- **Blackout Windows**: Block operations during maintenance windows (by timezone, day-of-week, time range)
- **TOTP 2FA**: Admin/root must set up Google Authenticator before approving any request
- **UI**: Fluent UI v9 — native Teams look and feel

---

## Architecture

```
Teams Tab (React + Vite)
        │
        │  Teams SSO token (JWT)
        ▼
Go API Server (Gin) — Lambda / port 8081
        │
        ├── DynamoDB ── users, restart-requests, blackout-windows, aws-accounts, account-members
        ├── AWS EC2  ── DescribeInstances, Reboot/Stop/StartInstances (hub account)
        ├── STS      ── AssumeRole → EC2 in spoke accounts
        └── CloudTrail── LookupEvents (operation history)
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

## Multi-Account Setup (Hub-and-Spoke)

Allows managing EC2 instances across multiple AWS accounts. The Lambda (hub) assumes an IAM role in each spoke account.

### Step 1 — Create IAM Role in each spoke account

In each AWS account you want to manage, create an IAM Role:

**Trust policy** (allow hub account to assume):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::<HUB_ACCOUNT_ID>:role/<LambdaExecutionRole>"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "<ExternalId from app>" }
    }
  }]
}
```

**Permission policy** (attach to the role):
```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:DescribeInstances",
    "ec2:RebootInstances",
    "ec2:StopInstances",
    "ec2:StartInstances"
  ],
  "Resource": "*"
}
```

Also add `sts:AssumeRole` to the **hub account's Lambda execution role**.

### Step 2 — Add account in app (Root only)

1. Go to **AWS Accounts** tab in the app
2. Click **Add Account** and fill in:
   - **Account ID** — 12-digit AWS account number
   - **Alias** — friendly name (e.g. "Production", "Staging")
   - **Role ARN** — `arn:aws:iam::<account_id>:role/<role_name>`
   - **External ID** — click **Generate** to create one, then paste it into the IAM trust policy above
   - **Regions** — comma-separated list of regions to scan (e.g. `us-west-2,ap-southeast-1`)
   - **Project** — optional tag for grouping

3. Click **Create**

### Step 3 — Assign users to account

In the **Members** column, click the user icon → add users who are allowed to see and operate EC2 in that account.

Users not assigned to any account see only the hub account's EC2 instances.

> **CloudTrail audit**: Each AssumeRole session uses the user's email as `RoleSessionName`, so CloudTrail in spoke accounts records who performed each operation.

---

## Blackout Windows (Root only)

Prevents operations (reboot/stop/start) during scheduled maintenance periods. Checked at both **request submit time** and **approve time**.

### Creating a blackout window

1. Go to **Blackout Windows** tab
2. Click **Add Window** and fill in:
   - **Name** — descriptive label (e.g. "Weekend Freeze", "Business Hours")
   - **Start Time / End Time** — 24h format (e.g. `22:00` – `06:00`)
   - **Timezone** — IANA timezone (e.g. `Asia/Ho_Chi_Minh`, `UTC`, `America/New_York`)
   - **Days of Week** — select which days apply
   - **Scope** — what to block:
     - `all` — blocks all operations
     - `operation:stop` — blocks only Stop operations
     - `project:ProjectName` — blocks only instances tagged with that project
   - **Reason** — shown to users when their request is blocked

3. Toggle **Active/Inactive** at any time without deleting the window

### Behaviour

| When blocked | What happens |
|---|---|
| User submits request | Request rejected immediately with reason |
| Admin approves request | Approval rejected even if request was created before the window |

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
