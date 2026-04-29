yyy#!/usr/bin/env bash
# Usage:
#   REGION=ap-southeast-1 ./create-dynamodb-tables.sh
#   REGION=ap-southeast-1 AWS_PROFILE=my-admin-profile ./create-dynamodb-tables.sh

set -euo pipefail

REGION="${REGION:-ap-southeast-1}"
PROFILE_FLAG=""
if [ -n "${AWS_PROFILE:-}" ]; then
  PROFILE_FLAG="--profile $AWS_PROFILE"
fi

echo "Creating DynamoDB tables in region: $REGION"

# ── projects ──────────────────────────────────────────────────────────────────

echo ""
echo "[1/2] Creating table: projects"
aws dynamodb create-table \
  --table-name projects \
  --attribute-definitions AttributeName=projectId,AttributeType=S \
  --key-schema AttributeName=projectId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  $PROFILE_FLAG

echo "Waiting for 'projects' to become ACTIVE..."
aws dynamodb wait table-exists --table-name projects --region "$REGION" $PROFILE_FLAG
echo "  projects — ACTIVE"

# ── project-members ───────────────────────────────────────────────────────────

echo ""
echo "[2/2] Creating table: project-members"
aws dynamodb create-table \
  --table-name project-members \
  --attribute-definitions \
    AttributeName=projectId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
  --key-schema \
    AttributeName=projectId,KeyType=HASH \
    AttributeName=userId,KeyType=RANGE \
  --global-secondary-indexes '[
    {
      "IndexName": "userId-index",
      "KeySchema": [{"AttributeName":"userId","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]' \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  $PROFILE_FLAG

echo "Waiting for 'project-members' to become ACTIVE..."
aws dynamodb wait table-exists --table-name project-members --region "$REGION" $PROFILE_FLAG
echo "  project-members — ACTIVE"

echo ""
echo "Done. Both tables are ready."
