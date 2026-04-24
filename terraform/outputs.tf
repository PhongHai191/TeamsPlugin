output "lambda_function_url" {
  description = "Lambda Function URL — set as VITE_API_URL backend in frontend build"
  value       = aws_lambda_function_url.backend.function_url
}

output "lambda_role_arn" {
  description = "Lambda execution role ARN"
  value       = aws_iam_role.lambda.arn
}

output "dynamodb_table_arns" {
  description = "ARNs of all DynamoDB tables"
  value = {
    users            = aws_dynamodb_table.users.arn
    restart_requests = aws_dynamodb_table.restart_requests.arn
    mfa_challenges   = aws_dynamodb_table.mfa_challenges.arn
    blackout_windows = aws_dynamodb_table.blackout_windows.arn
    aws_accounts     = aws_dynamodb_table.aws_accounts.arn
    account_members  = aws_dynamodb_table.account_members.arn
  }
}
