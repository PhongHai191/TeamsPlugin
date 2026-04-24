# TeamAWSExtension — Architecture & Roadmap

Tài liệu thiết kế hệ thống, quyết định kỹ thuật, và kế hoạch mở rộng.

---

## Trạng thái hiện tại

### Những gì đã có

```
MS Teams / Web Demo
    ↓ Teams SSO token (Entra ID JWT)  [chưa test trên Teams thật — xem phần SSO]
    ↓
Backend Lambda (Go + Gin)
    ↓ Validate token → lấy user từ DynamoDB
    ↓
Approval workflow
    ├── User: submit request + lý do
    ├── Admin: approve với TOTP 6 số
    └── Backend: gọi EC2 API → reboot
    ↓
DynamoDB audit trail
    requestId, userId, userName, instanceId, reason,
    approvedBy, approvedByName, status, timestamps
```

### Những gì chưa làm

- Multi-account AssumeRole (đang dùng 1 account cứng)
- Start / Stop instance (chỉ có Reboot)
- Blackout window (không có giờ cấm request)
- Teams SSO thật sự (đang chạy web demo, chưa publish lên Teams)

---

## Teams SSO — Trạng thái và rủi ro

### Hiện tại

App đang chạy tại `https://fragrant-sun-4b45.hieulun76a.workers.dev` như một web thông thường. Auth đang dùng fallback mode: lấy role từ URL param `?role=admin`.

### Khi publish lên Teams

Teams Tab App sẽ chạy trong iframe của Teams client. `@microsoft/teams-js` SDK sẽ:
1. Gọi `microsoftTeams.app.initialize()` thành công
2. Lấy token Entra ID của user đang đăng nhập Teams qua `getAuthToken()`
3. Token này được gửi lên backend, backend validate với Microsoft JWKS

```typescript
// useTeamsAuth.ts — đã có sẵn logic này
try {
    await microsoftTeams.app.initialize()          // Teams context
    const token = await getAuthToken()             // Entra ID JWT
    setAuthToken(token)                            // gắn vào axios header
} catch {
    // Fallback: web demo mode với ?role= param
}
```

### Những gì cần làm trước khi publish lên Teams

1. **Azure App Registration** — tạo app trong Entra ID, lấy Client ID
2. **Teams manifest** — điền `{{AZURE_AD_APP_CLIENT_ID}}`, `{{FRONTEND_URL}}` vào `teams/manifest.json`
3. **Backend JWKS validation** — hiện tại `parseTeamsToken` parse không verify signature. Cần verify với Microsoft public keys trước khi lên production.
4. **CORS** — backend Lambda đang `AllowAllOrigins: true`, cần restrict về Teams domain khi production.

### Rủi ro hiện tại của token validation

```go
// middleware/auth.go — HIỆN TẠI
parser := jwt.NewParser(jwt.WithoutClaimsValidation())
token, _, err := parser.ParseUnverified(tokenStr, jwt.MapClaims{})
// ↑ KHÔNG verify signature — chấp nhận được cho demo, KHÔNG dùng production
```

Cần replace bằng verify thật trước khi lên Teams thật.

---

## Kiến trúc bảo mật — Hub-and-Spoke AssumeRole

### Tổng quan

```
┌─────────────────────────────────────────────────────────┐
│  HUB (account nội bộ — nơi Lambda chạy)                │
│                                                         │
│  MS Teams → Backend Lambda                             │
│               │                                         │
│               │ sts:AssumeRole                          │
│               │ RoleSessionName = hieu.nguyen@co.com   │
│               │ ExternalId      = <secret per account> │
└───────────────┼─────────────────────────────────────────┘
                │
    ┌───────────┼────────────┐
    ↓           ↓            ↓
┌───────┐  ┌───────┐  ┌───────┐
│ Acc A │  │ Acc B │  │ Acc C │
│  Role │  │  Role │  │  Role │
└───────┘  └───────┘  └───────┘

CloudTrail ghi: hieu.nguyen@congty.com  ← đích danh người thực hiện
```

### Tại sao ExternalId

Không có ExternalId → attacker biết ARN của target role → AssumeRole thành công từ bất kỳ đâu (**Confused Deputy Attack**).

Có ExternalId → phải biết cả ARN lẫn secret UUID mới assume được. ExternalId lưu trong DynamoDB, không expose ra ngoài.

### Setup một lần trên mỗi target account

**Bước 1 — Sinh ExternalId**

App tự sinh UUID khi root thêm account. Copy UUID này để dùng ở Bước 2.

**Bước 2 — Tạo IAM Role trong target account**

IAM → Roles → Create Role → Custom trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::<HUB_ACCOUNT_ID>:role/<LAMBDA_ROLE_NAME>"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "<UUID từ bước 1>"
      }
    }
  }]
}
```

**Bước 3 — Permission Policy**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Describe",
      "Effect": "Allow",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    },
    {
      "Sid": "OperationsTaggedOnly",
      "Effect": "Allow",
      "Action": [
        "ec2:RebootInstances",
        "ec2:StopInstances",
        "ec2:StartInstances"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Restartable": "true"
        }
      }
    }
  ]
}
```

Đặt tên role: `TeamAWSExtension-ExecutionRole`

**Bước 4 — Cấp quyền cho Lambda HUB**

Thêm vào Lambda execution role:

```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "arn:aws:iam::*:role/TeamAWSExtension-ExecutionRole"
}
```

### Go implementation — AssumeRole với ExternalId

```go
func (s *EC2Service) assumeRole(ctx context.Context, roleArn, externalId, userEmail string) (aws.CredentialsProvider, error) {
    sessionName := sanitizeSessionName(userEmail) // max 64 chars, [a-zA-Z0-9=,.@-_]

    out, err := s.stsClient.AssumeRole(ctx, &sts.AssumeRoleInput{
        RoleArn:         aws.String(roleArn),
        RoleSessionName: aws.String(sessionName),
        ExternalId:      aws.String(externalId),
        DurationSeconds: aws.Int32(900), // 15 phút
    })
    if err != nil {
        return nil, fmt.Errorf("AssumeRole %s: %w", roleArn, err)
    }

    c := out.Credentials
    return aws.CredentialsProviderFunc(func(ctx context.Context) (aws.Credentials, error) {
        return aws.Credentials{
            AccessKeyID:     aws.ToString(c.AccessKeyId),
            SecretAccessKey: aws.ToString(c.SecretAccessKey),
            SessionToken:    aws.ToString(c.SessionToken),
        }, nil
    }), nil
}
```

---

## EC2 Operations — Start / Stop / Reboot

### So sánh 3 operations

| | Reboot | Stop | Start |
|---|---|---|---|
| EC2 state | running → running | running → stopped | stopped → running |
| Downtime | ~1 phút | đến khi Start | ~1 phút |
| Data mất | Không | Instance store | Không |
| IP thay đổi | Không (giữ IP) | Public IP mất nếu không có Elastic IP | IP mới nếu không có Elastic IP |
| Risk level | medium | high | low |
| Dùng khi | Restart OS | Tắt hẳn để tiết kiệm chi phí / bảo trì | Bật lại sau khi Stop |

### Risk level → UX khác nhau

```
Reboot (medium):
  Submit request → Admin approve + TOTP → Execute

Stop (high):
  Submit request → Admin approve + TOTP
  → Confirm dialog "Instance sẽ bị tắt hoàn toàn, IP public có thể thay đổi"
  → Execute

Start (low):
  Submit request → Admin approve + TOTP → Execute
  (chỉ chạy được khi instance đang stopped)
```

### Operation type lưu trong request

Thêm field `operation` vào `RestartRequest`:

```
operation: "reboot" | "stop" | "start"
```

Frontend chỉ show operation phù hợp với state hiện tại:
- Instance `running`: cho phép Reboot, Stop
- Instance `stopped`: cho phép Start

---

## Blackout Window — Giờ cấm request

### Use case

- Giờ cao điểm traffic → không cho phép Stop/Reboot
- Freeze trước release → không cho phép bất kỳ operation nào
- Maintenance window → chỉ cho phép trong khung giờ nhất định

### DynamoDB table `blackout-windows`

```
windowId:    UUID (PK)
name:        "Giờ cao điểm - Không thao tác Prod"
startTime:   "08:00"
endTime:     "18:00"
timezone:    "Asia/Ho_Chi_Minh"
daysOfWeek:  ["Mon","Tue","Wed","Thu","Fri"]
scope:       "all" | "project:CustomerA" | "operation:stop"
reason:      "Peak traffic — risk of revenue impact"
active:      true
createdBy:   "root-user-id"
```

### Scope logic

```
"all"              → block tất cả operations trên tất cả instances
"project:X"        → block operations trên instances thuộc project X
"operation:stop"   → chỉ block Stop, Reboot vẫn được
"operation:stop,reboot" → block cả Stop và Reboot
```

### Khi nào check

Check tại **2 điểm**:

1. **Lúc submit request** — user thấy ngay "Không thể submit trong giờ này" + thời gian window kết thúc
2. **Lúc admin approve** — phòng trường hợp window bắt đầu sau khi request đã được tạo

```go
func (s *DynamoDBService) CheckBlackout(ctx context.Context, project, operation string) (*BlackoutWindow, error) {
    // Scan active windows, check current time in window's timezone
    // Return the matching window if blocked, nil if allowed
}
```

### Ai có quyền quản lý

- **Root**: tạo, sửa, xóa, bật/tắt tất cả windows
- **Admin**: xem danh sách windows (read-only)
- **User**: thấy thông báo khi bị chặn, không thấy cấu hình

### API endpoints

```
GET    /api/admin/blackout              — list tất cả windows
POST   /api/root/blackout               — tạo window mới
PUT    /api/root/blackout/:id           — sửa window
DELETE /api/root/blackout/:id           — xóa window
PATCH  /api/root/blackout/:id/toggle    — bật/tắt nhanh
```

---

## Operation Registry — Mở rộng sau này

Hiện tại operations được hardcode (reboot/stop/start). Khi cần thêm operations mới (restart nginx, clear cache, ECS deploy...), dùng Operation Registry thay vì sửa code.

### DynamoDB table `operation-types`

```
operationId:    "restart-nginx"
displayName:    "Restart Nginx"
targetType:     "ec2"
executor:       "ssm-command"
executorConfig: {"document": "AWS-RunShellScript", "commands": ["systemctl restart nginx"]}
riskLevel:      "low"
dualApproval:   false
confirmText:    null

operationId:    "terminate-ec2"
displayName:    "Terminate Instance"
targetType:     "ec2"
executor:       "ec2-api"
executorConfig: {"action": "TerminateInstances"}
riskLevel:      "critical"
dualApproval:   true          ← cần 2 admin approve
confirmText:    "TERMINATE"   ← phải gõ lại để confirm
```

### Executor types hiện tại và tương lai

```
ec2-api     → EC2 instance lifecycle (start/stop/reboot/terminate)
ssm-command → Chạy shell script trong OS (restart service, clear cache)
rds-api     → RDS operations (reboot, failover, snapshot)
ecs-api     → ECS operations (restart service, scale task count)
```

Thêm operation mới = thêm record vào DynamoDB, **không cần redeploy Lambda**.

---

## Account Management

### DynamoDB tables cần thêm

**`aws-accounts`**
```
accountId:   "123456789012" (PK)
alias:       "Production - Customer A"
roleArn:     "arn:aws:iam::123456789012:role/TeamAWSExtension-ExecutionRole"
externalId:  "<UUID — không expose ra frontend>"
regions:     ["ap-southeast-1", "us-east-1"]
project:     "CustomerA"
addedAt:     ISO timestamp
addedBy:     teamsUserId
```

**`account-members`**
```
userId:      teamsUserId (PK)
accountId:   "123456789012" (SK)
grantedBy:   teamsUserId
grantedAt:   ISO timestamp
```

### User lifecycle

```
Nhân viên mới:
  Login Teams → auto tạo user role=user
  Root assign account-members
  → Thấy EC2 của accounts được assign

Nhân viên nghỉ:
  IT khóa email M365 → không vào được app
  Root xóa khỏi account-members
  → Không cần động vào AWS Console
```

---

## Roadmap

### Giai đoạn 1 — Đang có (MVP)

- [x] Teams SSO fallback (web demo)
- [x] RBAC: user / admin / root
- [x] Submit request + lý do
- [x] Approve với TOTP
- [x] Re-link 2FA
- [x] EC2 list (multi-region, project tag)
- [x] Reboot EC2
- [x] Audit trail trong DynamoDB (approvedBy, reason, timestamps)
- [x] Reboot history per instance

### Giai đoạn 2 — Cần làm

- [ ] **Start / Stop EC2** — thêm operation type vào request model + UI
- [ ] **Blackout window** — table + check khi submit/approve + UI quản lý (root)
- [ ] **Teams SSO thật** — verify JWT signature, publish manifest lên Teams Admin
- [ ] **Multi-account** — `aws-accounts` table + AssumeRole với ExternalId + UI account management

### Giai đoạn 3 — Mở rộng

- [ ] **Operation Registry** — cho phép root thêm operation mới không cần redeploy
- [ ] **SSM RunCommand** — restart service, clear cache thay vì chỉ OS-level operations
- [ ] **RDS operations** — reboot, snapshot trước khi thao tác
- [ ] **Dual approval** — operations critical cần 2 admin approve

---

## Threat Model

| Tình huống | Kết quả |
|---|---|
| Attacker biết ARN target role | Fail — không có ExternalId |
| Attacker có ExternalId, không phải Lambda role | Fail — trust policy chặn |
| Lambda bị compromise | Chỉ thao tác được instance có tag `Restartable=true` |
| Admin mất điện thoại | Không approve được cho đến khi re-link 2FA |
| Nhân viên nghỉ, chưa xóa khỏi app | IT khóa M365 → không vào được app |
| Teams token bị leak | Hết hạn tự động, không lưu AWS credentials |
| Request submit trong blackout window | Bị block ngay tại backend |

| Không bảo vệ được | Ghi chú |
|---|---|
| Lambda environment bị compromise hoàn toàn | Attacker đọc được DynamoDB → có ExternalId |
| HUB AWS account bị compromise | Cần bảo vệ HUB account riêng |
| Token validation chưa verify signature | **Fix trước khi lên Teams production** |

---

## Checklist trước khi lên Teams production

- [ ] Verify JWT signature trong `middleware/auth.go` (bỏ `WithoutClaimsValidation`)
- [ ] Tạo Azure App Registration, lấy Client ID
- [ ] Điền đầy đủ `teams/manifest.json`
- [ ] Test `getAuthToken()` trong Teams client thật
- [ ] Restrict CORS về Teams domain (bỏ `AllowAllOrigins: true`)
- [ ] Enable CloudTrail trên tất cả target accounts
- [ ] Review và rotate ExternalId định kỳ
