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
export AWS_REGION=us-west-2
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
| GET | `/api/admin/ec2/:instanceId/reboot-history` | admin, root | Operation history for instance (DynamoDB) |
| GET | `/api/admin/users` | admin, root | List users (admin sees `user` role only; root sees all) |
| POST | `/api/root/users/role` | root | Change user role (admin ↔ user) |
| GET | `/api/admin/totp/setup` | admin, root | Generate TOTP secret + otpauth URL |
| POST | `/api/admin/totp/verify-setup` | admin, root | Verify first code and enable TOTP |
| POST | `/api/admin/totp/reset` | admin, root | Clear TOTP secret to re-link authenticator |
| GET | `/api/admin/blackout` | admin, root | List all blackout windows |
| POST | `/api/root/blackout` | root | Create blackout window |
| PUT | `/api/root/blackout/:id` | root | Update blackout window |
| DELETE | `/api/root/blackout/:id` | root | Delete blackout window |
| PATCH | `/api/root/blackout/:id/toggle?active=true\|false` | root | Enable/disable window |
| GET | `/api/root/accounts` | root | List AWS accounts |
| POST | `/api/root/accounts` | root | Add AWS account |
| DELETE | `/api/root/accounts/:id` | root | Remove AWS account |
| GET | `/api/root/accounts/generate-external-id` | root | Generate random ExternalId |
| GET | `/api/root/accounts/:id/members` | root | List account members |
| POST | `/api/root/accounts/:id/members` | root | Add member to account |
| DELETE | `/api/root/accounts/:id/members/:userId` | root | Remove member from account |
| GET | `/api/me` | any | Current user profile + role from DynamoDB |

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
- Attributes: `userId`, `userName`, `instanceId`, `instanceName`, `region`, `reason`, `operation` (`reboot`|`stop`|`start`), `accountId`, `status`, `denyReason`, `createdAt`, `updatedAt`, `approvedBy`, `approvedByName`

### `blackout-windows`
- PK: `windowId` (UUID)
- Attributes: `name`, `startTime`, `endTime`, `timezone`, `daysOfWeek`, `scope`, `reason`, `active`

### `aws-accounts`
- PK: `accountId` (AWS 12-digit account ID)
- Attributes: `alias`, `roleArn`, `externalId`, `regions`, `project`

### `account-members`
- PK: `accountId`, SK: `userId`
- Attributes: `addedAt`

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
    "ec2:StopInstances",
    "ec2:StartInstances",
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:Query",
    "dynamodb:Scan",
    "dynamodb:DeleteItem",
    "cloudtrail:LookupEvents"
  ],
  "Resource": "*"
}
```

## DynamoDB Tables

| Table | PK | Purpose |
|---|---|---|
| `users` | `teamsUserId` | User profiles, roles, TOTP secrets |
| `restart-requests` | `requestId` | Operation requests + audit trail |
| `mfa-challenges` | `challengeId` | Number-matching MFA challenges |
| `blackout-windows` | `windowId` | Time-based operation blocks |

Create `blackout-windows`:
```bash
aws dynamodb create-table \
  --table-name blackout-windows \
  --attribute-definitions AttributeName=windowId,AttributeType=S \
  --key-schema AttributeName=windowId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1
```

## Multi-Account (Hub-and-Spoke)

**Flow:**
1. Root adds an AWS account via UI → stored in `aws-accounts` table with `roleArn` + `externalId`
2. Root assigns users to accounts via `account-members` table
3. On `GET /ec2/instances`: backend checks which accounts the user is a member of → AssumeRole per account → aggregate instances
4. On approve: `ExecuteOperationWithRole` if `req.AccountID != ""`, else use hub credentials
5. `RoleSessionName = sanitized(userEmail)` → CloudTrail in spoke account records who ran the operation

**ExternalId**: Generated randomly per account registration. Prevents Confused Deputy Attack — the spoke role's trust policy must include `sts:ExternalId` condition.

**Hub fallback**: If user has no account memberships → shows hub account EC2 only.

## Blackout Windows

- Stored in `blackout-windows` table, checked in `service.CheckBlackout(ctx, operation, project)`
- Checked at two points: `CreateRequest` and `ApproveWithOTP`
- `scope` field controls what is blocked:
  - `all` — every operation
  - `operation:stop` — only stop operations
  - `project:X` — only instances with project tag matching X
- Timezone conversion uses `time.LoadLocation(window.Timezone)` — must be valid IANA tz string
- `active` flag allows toggling without deleting (PATCH `/root/blackout/:id/toggle?active=true|false`)

## Key Design Decisions

- Role stored in DynamoDB, not in Teams token — backend is authoritative
- EC2 operations (reboot/stop/start) executed only after TOTP verified and request confirmed `pending`
- Blackout windows checked at both submit time and approve time
- TOTP secret stored in DynamoDB per-user; `totpEnabled` flag separates setup-in-progress from active
- EC2 operation history stored in DynamoDB `restart-requests` (not CloudTrail)
- Port 8081 used locally due to Apache conflict on 8080
- `VITE_API_URL=/api` (relative path) routes through Vite proxy — avoids CORS entirely in dev
