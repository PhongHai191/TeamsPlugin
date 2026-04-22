# TeamAWSExtension — CLAUDE.md

Microsoft Teams Tab App for managing EC2 server restart requests.

## Project Structure

```
TeamAWSExtension/
├── frontend/          React 19 + Vite + Fluent UI v9
├── backend/           Go 1.26 + Gin
└── teams/             Teams App manifest
```

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Fluent UI v9, `@microsoft/teams-js` v2
- **Backend**: Go, Gin, AWS SDK v2 (DynamoDB + EC2), `golang-jwt/jwt`
- **Database**: DynamoDB (2 tables: `users`, `restart-requests`)
- **Auth**: Teams SSO — backend validates MS Entra JWT, no separate login

## Running Locally

### Backend
```bash
cd backend
export AWS_REGION=ap-southeast-1
export FRONTEND_URL=http://localhost:5173
go run ./cmd/server
# Listens on :8080
```

### Frontend
```bash
cd frontend
cp .env.example .env
# Edit VITE_DEV_ROLE=admin to test admin view locally
npm run dev
# Listens on :5173, proxies /api → localhost:8080
```

### Dev notes
- Outside Teams, `useTeamsAuth` falls back to a mock user (DEV only)
- Set `VITE_DEV_ROLE=admin` in `.env` to render AdminDashboard locally
- The Vite dev server proxies `/api/*` to the Go backend (see `vite.config.ts`)

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/ec2/instances` | any | List restartable EC2 instances |
| POST | `/api/requests` | user | Submit restart request |
| GET | `/api/requests/me` | user | List caller's own requests |
| GET | `/api/admin/requests` | admin | List all requests (filter: `?status=pending`) |
| POST | `/api/admin/requests/approve` | admin | Approve + reboot EC2 |
| POST | `/api/admin/requests/deny` | admin | Deny with reason |

## DynamoDB Tables

### `users`
- PK: `teamsUserId` (string)
- Attributes: `displayName`, `email`, `role` (`admin` | `user`)
- New users auto-created on first login with role `user`; promote to `admin` manually

### `restart-requests`
- PK: `requestId` (UUID)
- GSI: `userId-createdAt-index` (for employee "my requests" query)
- Attributes: `userId`, `userName`, `instanceId`, `instanceName`, `reason`, `status`, `denyReason`, `createdAt`, `updatedAt`

## EC2 Tag Convention

Only instances tagged `Restartable=true` appear in the dropdown.

```bash
aws ec2 create-tags --resources i-xxxx --tags Key=Restartable,Value=true
```

## Teams Manifest

`teams/manifest.json` contains placeholders:
- `{{TEAMS_APP_ID}}` — generate with `uuidgen`
- `{{FRONTEND_URL}}` — deployed frontend URL (must be HTTPS)
- `{{FRONTEND_DOMAIN}}` — domain only (no protocol)
- `{{AZURE_AD_APP_CLIENT_ID}}` — from Azure App Registration

## AWS IAM Required Permissions

The IAM role/user running the backend needs:
```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:DescribeInstances",
    "ec2:RebootInstances",
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:Query",
    "dynamodb:Scan"
  ],
  "Resource": "*"
}
```

## Key Design Decisions

- Role stored in DynamoDB, not in Teams token — backend is authoritative for role checks
- `ec2:RebootInstances` is called only after DB status is verified as `pending` to prevent double-reboot
- No bot — pure Tab app with dashboard UI using Fluent UI (Teams native look)
- Auth middleware validates Teams JWT but does not fully verify signature in dev; production should use a proper JWKS library
