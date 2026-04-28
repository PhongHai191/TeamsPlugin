#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  setup-spoke-account.sh
#
#  Chạy script này trên AWS account bạn muốn kết nối vào Teams Server Restart.
#  Script sẽ:
#    1. Tạo IAM Role cho phép hub account AssumeRole vào đây
#    2. Tự sinh ExternalId ngẫu nhiên (chống Confused Deputy Attack)
#    3. In ra Role ARN + ExternalId để điền vào app
#
#  YÊU CẦU:
#    - AWS CLI đã cấu hình với quyền của account cần add (spoke)
#    - Quyền IAM: iam:CreateRole, iam:PutRolePolicy, iam:AttachRolePolicy
#
#  CÁCH DÙNG:
#    chmod +x setup-spoke-account.sh
#    ./setup-spoke-account.sh
#
#    Tuỳ chọn:
#    ./setup-spoke-account.sh --role-name MyCustomRoleName --regions "ap-southeast-1,us-east-1"
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Hub account config (không đổi) ───────────────────────────────────────────
HUB_ROLE_ARN="arn:aws:iam::028708951757:role/service-role/teams-aws-backend-role-ela82brj"

# ── Defaults ─────────────────────────────────────────────────────────────────
ROLE_NAME="TeamsAppEC2Access"
REGIONS="us-west-2"

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --role-name) ROLE_NAME="$2"; shift 2 ;;
    --regions)   REGIONS="$2";   shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${YELLOW}▶ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
value()   { echo -e "${CYAN}$*${NC}"; }

# ── Generate ExternalId ───────────────────────────────────────────────────────
EXTERNAL_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))" 2>/dev/null \
  || cat /proc/sys/kernel/random/uuid 2>/dev/null \
  || openssl rand -hex 16)

SPOKE_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │   Teams Server Restart — Spoke Account Setup │"
echo "  └─────────────────────────────────────────────┘"
echo ""
info "Spoke account : $SPOKE_ACCOUNT_ID"
info "Hub role      : $HUB_ROLE_ARN"
info "Role name     : $ROLE_NAME"
info "External ID   : $EXTERNAL_ID"
echo ""

# ── Trust policy ──────────────────────────────────────────────────────────────
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "$HUB_ROLE_ARN"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "$EXTERNAL_ID"
      }
    }
  }]
}
EOF
)

# ── Permission policy ─────────────────────────────────────────────────────────
PERMISSION_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:DescribeInstances",
      "ec2:RebootInstances",
      "ec2:StopInstances",
      "ec2:StartInstances"
    ],
    "Resource": "*"
  }]
}
EOF
)

# ── Create role ───────────────────────────────────────────────────────────────
info "Creating IAM role: $ROLE_NAME ..."

if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  info "Role đã tồn tại — đang cập nhật trust policy..."
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "$TRUST_POLICY"
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --description "Allows Teams Server Restart app to manage EC2 in this account" \
    --output text --query 'Role.RoleName' > /dev/null
fi

success "Role created/updated"

# ── Attach permissions ────────────────────────────────────────────────────────
info "Attaching EC2 permissions..."
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "TeamsAppEC2Permissions" \
  --policy-document "$PERMISSION_POLICY"
success "Permissions attached"

# ── Get Role ARN ──────────────────────────────────────────────────────────────
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

# ── Output ────────────────────────────────────────────────────────────────────
echo ""
echo "  ┌──────────────────────────────────────────────────────────────┐"
echo "  │           Điền các giá trị sau vào app (AWS Accounts tab)    │"
echo "  └──────────────────────────────────────────────────────────────┘"
echo ""
echo "  Account ID  : $(value "$SPOKE_ACCOUNT_ID")"
echo "  Role ARN    : $(value "$ROLE_ARN")"
echo "  External ID : $(value "$EXTERNAL_ID")"
echo "  Regions     : $(value "$REGIONS")"
echo ""
success "Done! Copy các giá trị trên vào app → AWS Accounts → Add Account."
echo ""
