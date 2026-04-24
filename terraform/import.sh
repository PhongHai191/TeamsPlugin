#!/usr/bin/env bash
# Import existing AWS resources into Terraform state.
# Run once after `terraform init`, before `terraform apply`.
set -euo pipefail

ACCOUNT_ID="028708951757"
REGION="us-west-2"

echo "▶ Importing IAM role..."
terraform import aws_iam_role.lambda teams-aws-backend-role-ela82brj

echo "▶ Importing IAM inline policy..."
terraform import aws_iam_role_policy.teams_app_access "teams-aws-backend-role-ela82brj:TeamsAppAccess"

echo "▶ Importing Lambda function..."
terraform import aws_lambda_function.backend teams-aws-backend

echo "▶ Importing DynamoDB tables..."
terraform import aws_dynamodb_table.users            "users"
terraform import aws_dynamodb_table.restart_requests "restart-requests"
terraform import aws_dynamodb_table.mfa_challenges   "mfa-challenges"
terraform import aws_dynamodb_table.blackout_windows "blackout-windows"
terraform import aws_dynamodb_table.aws_accounts     "aws-accounts"
terraform import aws_dynamodb_table.account_members  "account-members"

echo "✔ All imports done. Run: terraform plan"
