terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── IAM Role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda" {
  name = "teams-aws-backend-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Basic Lambda execution — CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# App-specific permissions
resource "aws_iam_role_policy" "teams_app_access" {
  name = "TeamsAppAccess"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          # EC2 operations
          "ec2:DescribeInstances",
          "ec2:RebootInstances",
          "ec2:StopInstances",
          "ec2:StartInstances",
          # DynamoDB
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          # CloudTrail (kept for future use)
          "cloudtrail:LookupEvents",
          "sts:AssumeRole",
        ]
        Resource = "*"
      }
    ]
  })
}

# ── Lambda Function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "backend" {
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda.arn

  filename         = var.lambda_zip_path
  source_code_hash = fileexists(var.lambda_zip_path) ? filebase64sha256(var.lambda_zip_path) : null

  runtime = "provided.al2023"
  handler = "bootstrap"

  memory_size = 128
  timeout     = 30

  environment {
    variables = {
      APP_REGION   = var.aws_region
      FRONTEND_URL = var.frontend_url
      DEV_ROLE     = var.dev_role
    }
  }
}

# Lambda Function URL (no auth — Teams token validated by backend itself)
resource "aws_lambda_function_url" "backend" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["https://${var.frontend_url}"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 86400
  }
}
