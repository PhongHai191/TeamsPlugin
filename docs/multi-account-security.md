# Multi-Account Security Architecture

Hub-and-Spoke AssumeRole với ExternalId — thiết kế cho Teams DevOps App.

---

## Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│  HUB (Tài khoản nội bộ)                                 │
│                                                         │
│  MS Teams → Backend Lambda                             │
│               │                                         │
│               │ sts:AssumeRole                          │
│               │ RoleSessionName = hieu.nguyen@co.com   │
│               │ ExternalId      = <secret-per-account> │
└───────────────┼─────────────────────────────────────────┘
                │
    ┌───────────┼────────────┐
    ↓           ↓            ↓
┌───────┐  ┌───────┐  ┌───────┐
│ Acc A │  │ Acc B │  │ Acc C │  ← SPOKE (tài khoản khách hàng / môi trường)
│  Role │  │  Role │  │  Role │
└───────┘  └───────┘  └───────┘

CloudTrail của từng account ghi:
AssumedRole/.../hieu.nguyen@congty.com  ← đích danh người thực hiện
```

### Luồng thực tế khi approve một request

```
1. Admin click Approve + nhập TOTP
2. Backend verify TOTP ✓
3. Backend gọi STS AssumeRole vào target account
     RoleSessionName = admin's email
     ExternalId      = secret của account đó (lưu trong DynamoDB)
4. STS trả về Temporary Credentials (hết hạn sau 15 phút)
5. Backend dùng temp creds gọi ec2:RebootInstances
6. CloudTrail target account ghi: hieu.nguyen@congty.com
7. Backend lưu requestId + approvedBy vào DynamoDB của HUB
```

---

## Tại sao cần ExternalId

Không có ExternalId, trust policy chỉ check nguồn gốc (Lambda role). Nếu kẻ tấn công biết ARN của target role, họ có thể AssumeRole từ bất kỳ account nào trust Lambda role đó — gọi là **Confused Deputy Attack**.

```
Không có ExternalId:
Attacker biết ARN → AssumeRole thành công ✗

Có ExternalId:
Attacker biết ARN → AssumeRole FAIL vì không có ExternalId ✓
Attacker biết ARN + ExternalId → Phải compromise Lambda trước
```

ExternalId là secret riêng per-account, không expose ra ngoài, chỉ Lambda biết (lưu trong DynamoDB).

---

## Setup một lần trên mỗi target account

### Bước 1 — Tạo ExternalId

Sinh một UUID ngẫu nhiên cho mỗi account. Mỗi account có ExternalId riêng.

```bash
python3 -c "import uuid; print(uuid.uuid4())"
# Ví dụ: a3f8c2d1-7e4b-4a9f-b6c3-2d1e8f7a0b5c
```

Lưu vào DynamoDB table `aws-accounts` cùng với roleArn (xem phần Account Management).

### Bước 2 — Tạo IAM Role trong target account

Vào AWS Console của target account (chỉ cần làm 1 lần):

**IAM → Roles → Create Role → Custom trust policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<HUB_ACCOUNT_ID>:role/<LAMBDA_ROLE_NAME>"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "a3f8c2d1-7e4b-4a9f-b6c3-2d1e8f7a0b5c"
        }
      }
    }
  ]
}
```

> Thay `<HUB_ACCOUNT_ID>` bằng account ID của backend Lambda.  
> Thay `<LAMBDA_ROLE_NAME>` bằng tên IAM Role của Lambda function.  
> Thay ExternalId bằng UUID vừa sinh ở Bước 1.

### Bước 3 — Gắn Permission Policy vào Role

Tạo inline policy — **chỉ cho reboot, chỉ instance có tag Restartable=true**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DescribeInstances",
      "Effect": "Allow",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    },
    {
      "Sid": "RebootTaggedOnly",
      "Effect": "Allow",
      "Action": "ec2:RebootInstances",
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

> Đặt tên role gợi nhớ: `TeamAWSExtension-ExecutionRole`

### Bước 4 — Copy Role ARN

Sau khi tạo xong, copy ARN của role:
```
arn:aws:iam::<TARGET_ACCOUNT_ID>:role/TeamAWSExtension-ExecutionRole
```

Dùng ARN này khi thêm account vào app (phần Account Management).

---

## Cấp quyền cho Lambda (Hub account)

Lambda cần thêm quyền `sts:AssumeRole`. Thêm vào Lambda execution role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/TeamAWSExtension-ExecutionRole"
    }
  ]
}
```

> `*` cho phép assume role ở bất kỳ account nào, miễn role tên là `TeamAWSExtension-ExecutionRole`. Nếu muốn chặt hơn thì liệt kê từng account ARN.

---

## Backend implementation

### DynamoDB table `aws-accounts`

```
PK: accountId (string)        — AWS Account ID, VD: "123456789012"
    alias     (string)        — "Production - Customer A"
    roleArn   (string)        — "arn:aws:iam::123456789012:role/TeamAWSExtension-ExecutionRole"
    externalId (string)       — UUID secret, không expose ra frontend
    regions   (list<string>)  — ["ap-southeast-1", "us-east-1"]
    project   (string)        — "CustomerA"
    addedAt   (string)        — ISO timestamp
    addedBy   (string)        — teamsUserId của người thêm
```

### AssumeRole với ExternalId (Go)

```go
import (
    "github.com/aws/aws-sdk-go-v2/service/sts"
    stTypes "github.com/aws/aws-sdk-go-v2/service/sts/types"
)

func (s *EC2Service) assumeRoleForAccount(
    ctx context.Context,
    roleArn, externalId, userEmail string,
) (aws.CredentialsProvider, error) {

    // Sanitize email — RoleSessionName chỉ cho phép [a-zA-Z0-9=,.@-]
    sessionName := sanitizeSessionName(userEmail)

    out, err := s.stsClient.AssumeRole(ctx, &sts.AssumeRoleInput{
        RoleArn:         aws.String(roleArn),
        RoleSessionName: aws.String(sessionName),
        ExternalId:      aws.String(externalId),
        DurationSeconds: aws.Int32(900), // 15 phút — đủ cho 1 operation
    })
    if err != nil {
        return nil, fmt.Errorf("AssumeRole failed for %s: %w", roleArn, err)
    }

    return aws.CredentialsProviderFunc(func(ctx context.Context) (aws.Credentials, error) {
        return aws.Credentials{
            AccessKeyID:     aws.ToString(out.Credentials.AccessKeyId),
            SecretAccessKey: aws.ToString(out.Credentials.SecretAccessKey),
            SessionToken:    aws.ToString(out.Credentials.SessionToken),
        }, nil
    }), nil
}

func sanitizeSessionName(email string) string {
    // Thay ký tự không hợp lệ bằng dấu gạch ngang
    re := regexp.MustCompile(`[^a-zA-Z0-9=,.@\-_]`)
    s := re.ReplaceAllString(email, "-")
    if len(s) > 64 { // AWS limit
        s = s[:64]
    }
    return s
}
```

### RebootInstance dùng assumed credentials

```go
func (s *EC2Service) RebootInstance(
    ctx context.Context,
    instanceID, region, roleArn, externalId, userEmail string,
) error {

    creds, err := s.assumeRoleForAccount(ctx, roleArn, externalId, userEmail)
    if err != nil {
        return err
    }

    cfg := s.baseCfg.Copy()
    cfg.Region = region
    cfg.Credentials = creds

    client := ec2.NewFromConfig(cfg)

    log.Printf("[EC2] Reboot %s in %s — session: %s", instanceID, region, sanitizeSessionName(userEmail))
    _, err = client.RebootInstances(ctx, &ec2.RebootInstancesInput{
        InstanceIds: []string{instanceID},
    })
    return err
}
```

---

## Account Management

### Thêm account mới (root only)

**Quy trình:**

```
1. DevOps setup IAM Role trong target account (Bước 1-4 ở trên) — 5 phút
2. Root vào Teams app → tab Accounts → Add Account
   - Account ID: 123456789012
   - Alias: Production - Customer A
   - Role ARN: arn:aws:iam::123456789012:role/TeamAWSExtension-ExecutionRole
   - External ID: <UUID từ bước 1>
   - Regions: ap-southeast-1
   - Project: CustomerA
3. Assign users/groups vào account
```

> ExternalId được sinh tự động bởi app khi thêm account, không cần DevOps tự sinh.
> Copy và paste vào trust policy khi tạo IAM Role.

### Xóa account

Root xóa account khỏi `aws-accounts` table → tất cả user mất quyền ngay lập tức. IAM Role trong target account vẫn tồn tại nhưng không ai có ExternalId để assume nữa.

Nên xóa luôn IAM Role trong target account sau khi offboard để dọn sạch.

---

## User Lifecycle

### Nhân viên mới

```
1. Login Teams lần đầu → tự động tạo user trong DynamoDB (đã có)
2. Root/Admin vào Users → assign account access
3. Nhân viên thấy EC2 của account được assign ngay
```

### Nhân viên nghỉ việc

```
1. IT khóa email M365 → không vào được Teams app
2. Root vào Users → Remove user (xóa khỏi account-members)

Không cần động vào bất kỳ AWS Console nào.
```

### Thay đổi quyền

```
Root/Admin thay đổi role trong app (user ↔ admin) → có hiệu lực ngay
```

---

## Threat Model

### Được bảo vệ

| Tình huống | Kết quả |
|---|---|
| Attacker biết ARN của target role | Fail — không có ExternalId |
| Attacker có ExternalId nhưng không phải Lambda role | Fail — trust policy chặn |
| Lambda bị compromise | Chỉ reboot được instance có tag `Restartable=true` |
| Admin bị mất điện thoại (TOTP) | Không approve được cho đến khi re-link 2FA |
| Nhân viên nghỉ việc | IT khóa email → mất quyền ngay |
| Token Teams bị leak | Hết hạn tự động, không lưu secret AWS |

### Không bảo vệ được

| Tình huống | Ghi chú |
|---|---|
| Lambda execution environment bị compromise hoàn toàn | Attacker có thể lấy DynamoDB ExternalId và role ARN |
| AWS account của HUB bị compromise | Cần bảo vệ HUB account theo chuẩn AWS riêng |
| Admin bị social engineering TOTP | Human problem, không phải technical |

---

## CloudTrail Output sau khi áp dụng

Trước:
```json
"userIdentity": {
  "type": "AssumedRole",
  "arn": "arn:aws:sts::123:assumed-role/LambdaRole/teams-aws-backend",
  "accountId": "123456789012"
}
```

Sau:
```json
"userIdentity": {
  "type": "AssumedRole",
  "arn": "arn:aws:sts::123:assumed-role/TeamAWSExtension-ExecutionRole/hieu.nguyen@congty.com",
  "accountId": "123456789012"
}
```

Kết hợp với DynamoDB audit trail trong HUB account → có đầy đủ:
- **CloudTrail target account**: ai thực hiện lệnh AWS
- **DynamoDB HUB**: ai request, lý do gì, ai approve, lúc nào

---

## Checklist triển khai

### Cho mỗi target account mới

- [ ] Sinh ExternalId (UUID) và lưu vào DynamoDB
- [ ] Tạo IAM Role `TeamAWSExtension-ExecutionRole` với trust policy + ExternalId
- [ ] Gắn permission policy (DescribeInstances + RebootInstances tagged only)
- [ ] Copy Role ARN, thêm vào app qua tab Accounts
- [ ] Test: request → approve → verify CloudTrail ghi đúng email

### Một lần cho HUB account

- [ ] Thêm `sts:AssumeRole` vào Lambda execution role
- [ ] Deploy backend với STS AssumeRole logic
- [ ] Set `STS_EXTERNAL_ID_ENCRYPTION_KEY` env var (nếu encrypt ExternalId trong DynamoDB)

### Bảo mật bổ sung (optional)

- [ ] Enable CloudTrail trên tất cả target accounts
- [ ] Set CloudWatch alert khi có AssumeRole thất bại liên tiếp
- [ ] Review account-members access quarterly
