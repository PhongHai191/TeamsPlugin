#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
LAMBDA_FUNCTION="teams-aws-backend"
CF_PROJECT_NAME="fragrant-sun-4b45"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${YELLOW}▶ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
error()   { echo -e "${RED}✘ $*${NC}" >&2; exit 1; }

# ── Arg parsing ───────────────────────────────────────────────────────────────
DEPLOY_BACKEND=true
DEPLOY_FRONTEND=true

for arg in "$@"; do
  case $arg in
    --backend-only)  DEPLOY_FRONTEND=false ;;
    --frontend-only) DEPLOY_BACKEND=false  ;;
    *) error "Unknown argument: $arg. Use --backend-only or --frontend-only" ;;
  esac
done

# ── Backend ───────────────────────────────────────────────────────────────────
deploy_backend() {
  info "Building backend (linux/amd64)..."
  cd "$BACKEND_DIR"

  GOOS=linux GOARCH=amd64 go build -o bootstrap ./cmd/server/main.go \
    || error "Go build failed"
  success "Build complete"

  info "Packaging function.zip..."
  zip -j function.zip bootstrap
  success "function.zip ready ($(du -sh function.zip | cut -f1))"

  info "Uploading to Lambda: $LAMBDA_FUNCTION..."
  aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION" \
    --zip-file fileb://function.zip \
    --output text --query 'LastModified' \
    || error "Lambda update failed"

  info "Waiting for Lambda update to complete..."
  aws lambda wait function-updated --function-name "$LAMBDA_FUNCTION"
  success "Lambda deployed successfully"

  rm -f bootstrap
  cd "$ROOT_DIR"
}

# ── Frontend ──────────────────────────────────────────────────────────────────
deploy_frontend() {
  info "Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  npm ci --silent

  info "Building frontend..."
  npm run build || error "Frontend build failed"
  success "Frontend build complete ($(du -sh dist | cut -f1))"

  info "Deploying to Cloudflare Pages: $CF_PROJECT_NAME..."
  npx wrangler pages deploy dist \
    --project-name "$CF_PROJECT_NAME" \
    --commit-dirty=true \
    || error "Cloudflare Pages deploy failed"
  success "Frontend deployed to Cloudflare Pages"

  cd "$ROOT_DIR"
}

# ── Run ───────────────────────────────────────────────────────────────────────
echo ""
echo "  Deploy: $([ $DEPLOY_BACKEND = true ] && echo 'Backend ' || echo '')$([ $DEPLOY_FRONTEND = true ] && echo 'Frontend' || echo '')"
echo ""

$DEPLOY_BACKEND  && deploy_backend
$DEPLOY_FRONTEND && deploy_frontend

echo ""
success "All done."
