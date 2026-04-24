# ── DynamoDB Tables ───────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "users" {
  name         = "users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "teamsUserId"

  attribute {
    name = "teamsUserId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "restart_requests" {
  name         = "restart-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "requestId"

  attribute {
    name = "requestId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-createdAt-index"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "mfa_challenges" {
  name         = "mfa-challenges"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "challengeId"

  attribute {
    name = "challengeId"
    type = "S"
  }

  # Auto-expire challenges after TTL (optional — set expiresAt as TTL attribute)
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "blackout_windows" {
  name         = "blackout-windows"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "windowId"

  attribute {
    name = "windowId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "aws_accounts" {
  name         = "aws-accounts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "accountId"

  attribute {
    name = "accountId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "account_members" {
  name         = "account-members"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "accountId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "accountId"
    type = "S"
  }

  global_secondary_index {
    name            = "accountId-index"
    hash_key        = "accountId"
    projection_type = "ALL"
  }
}
