variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-west-2"
}

variable "frontend_url" {
  description = "Deployed frontend URL (used for CORS and Lambda env var)"
  type        = string
  default     = "fragrant-sun-4b45.hieulun76a.workers.dev"
}

variable "lambda_function_name" {
  description = "Lambda function name"
  type        = string
  default     = "teams-aws-backend"
}

variable "lambda_zip_path" {
  description = "Path to the compiled Lambda zip (produced by deploy.sh)"
  type        = string
  default     = "../backend/function.zip"
}

variable "dev_role" {
  description = "DEV_ROLE env var — only used in non-release mode"
  type        = string
  default     = "admin"
}
