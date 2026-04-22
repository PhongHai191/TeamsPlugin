# TeamAWSExtension — CLAUDE.md

Microsoft Teams Tab App for managing EC2 server restart requests with role-based access and TOTP-protected approvals.

## Project Structure

```
TeamAWSExtension/
├── frontend/          React 19 + Vite + Fluent UI v9
├── backend/           Go 1.26 + Gin
└── teams/             Teams App manifest
```

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Fluent UI v9, `@microsoft/teams-js` v2, `qrcode.react`
- **Backend**: Go, Gin, AWS SDK v2 (DynamoDB + EC2 + CloudTrail), `golang-jwt/jwt`, `pquerna/otp`
- **Database**: DynamoDB (2 tables: `users`, `restart-requests`)
- **Auth**: Teams SSO — backend validates MS Entra JWT, no separate login
- **2FA**: TOTP (Google Authenticator compatible) required for approve action

## Running Locally

### Backend
```bash
cd backend
export AWS_REGION=ap-southeast-1
export FRONTEND_URL=http://localhost:5173
export PORT=8081
export DEV_ROLE=admin   # root | admin | user
go build -o /tmp/server ./cmd/server && /tmp/server
```

> **Note:** Port 8081 is used because Apache (`httpd.exe`) occupies 8080 on this machine.

### Frontend
```bash
cd frontend
cp .env.example .env
# VITE_API_URL=/api  (relative — goes through Vite proxy)
npm run dev   # :5173, proxies /api → localhost:8081
```

### Switch roles without restart
Append `?role=root`, `?role=admin`, or `?role=user` to the URL.  
Example: `http://localhost:5173?role=root`

### Dev TOTP bypass
In dev mode (`GIN_MODE != release`), if the token is `dev-mock-token`, TOTP verification is skipped automatically.

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/ec2/instances` | any | List EC2 instances tagged `Restartable=true` |
| POST | `/api/requests` | any | Submit restart request |
| GET | `/api/requests/me` | any | List caller's own requests |
| GET | `/api/admin/requests` | admin, root | List all requests (`?status=pending\|approved\|denied`) |
| POST | `/api/admin/requests/approve` | admin, root | Approve + reboot (requires `totpCode`) |
| POST | `/api/admin/requests/deny` | admin, root | Deny with reason |
| GET | `/api/admin/ec2/:instanceId/reboot-history` | admin, root | CloudTrail reboot history |
| GET | `/api/admin/users` | admin, root | List users (admin sees `user` role only; root sees all) |
| POST | `/api/root/users/role` | root | Change user role (admin ↔ user) |
| GET | `/api/admin/totp/setup` | admin, root | Generate TOTP secret + otpauth URL |
| POST | `/api/admin/totp/verify-setup` | admin, root | Verify first code and enable TOTP |

## Roles

| Role | Permissions |
|------|-------------|
| `root` | All admin permissions + view all users (root/admin/user) + change roles (admin↔user) |
| `admin` | View/approve/deny requests, view EC2 logs, view users with role `user` |
| `user` | Submit restart requests, view own request history and status |

- New users auto-created on first login with role `user`
- `root` role must be set manually in DynamoDB (cannot be assigned via UI)
- Admin/root cannot change their own role

## DynamoDB Tables

### `users`
- PK: `teamsUserId` (string)
- Attributes: `displayName`, `email`, `role` (`root`|`admin`|`user`), `totpSecret`, `totpEnabled`

### `restart-requests`
- PK: `requestId` (UUID)
- GSI: `userId-createdAt-index`
- Attributes: `userId`, `userName`, `instanceId`, `instanceName`, `reason`, `status`, `denyReason`, `createdAt`, `updatedAt`

## TOTP Flow

**Setup (one-time per admin):**
1. Admin opens app → warning banner if TOTP not set up
2. Click "Set up 2FA" → QR code modal appears
3. Scan with Google Authenticator / Authy
4. Enter 6-digit code to confirm → `totpEnabled = true` saved to DynamoDB

**Approve with TOTP:**
1. Admin clicks Approve → OTP modal appears
2. Enter 6-digit code → backend verifies → EC2 rebooted

## EC2 Tag Convention

Only instances tagged `Restartable=true` appear in the dropdown.

```bash
aws ec2 create-tags --resources i-xxxx --tags Key=Restartable,Value=true
```

## Teams Manifest Placeholders

`teams/manifest.json` contains:
- `{{TEAMS_APP_ID}}` — generate with `uuidgen`
- `{{FRONTEND_URL}}` — deployed frontend URL (must be HTTPS)
- `{{FRONTEND_DOMAIN}}` — domain only (no protocol)
- `{{AZURE_AD_APP_CLIENT_ID}}` — from Azure App Registration

## AWS IAM Required Permissions

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
    "dynamodb:Scan",
    "cloudtrail:LookupEvents"
  ],
  "Resource": "*"
}
```

## Key Design Decisions

- Role stored in DynamoDB, not in Teams token — backend is authoritative
- `ec2:RebootInstances` called only after TOTP verified and status confirmed `pending`
- TOTP secret stored in DynamoDB per-user; `totpEnabled` flag separates setup-in-progress from active
- EC2 reboot history fetched from CloudTrail `LookupEvents` filtered by `RebootInstances`
- Port 8081 used locally due to Apache conflict on 8080
- `VITE_API_URL=/api` (relative path) routes through Vite proxy — avoids CORS entirely in dev
