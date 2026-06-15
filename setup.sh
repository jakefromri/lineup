#!/usr/bin/env bash
# setup.sh — lineup project bootstrapper
# Run from the repo root: bash setup.sh

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

header()  { echo -e "\n${CYAN}━━━ $1 ${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
info()    { echo -e "  $1"; }

echo -e "\n${CYAN}lineup — Project Setup${NC}"
echo -e "Sets up Supabase project + writes .env files\n"

# ─── 1. Check Supabase CLI ────────────────────────────────────────────────────
header "Checking Supabase CLI"
if ! command -v supabase &> /dev/null; then
  warn "Supabase CLI not found."
  echo ""
  echo "  Install with Homebrew:  brew install supabase/tap/supabase"
  echo "  Or via npm:             npm install -g supabase"
  echo ""
  exit 1
fi
success "Supabase CLI found: $(supabase --version)"

# ─── 2. Login ─────────────────────────────────────────────────────────────────
header "Supabase Login"
echo "Checking if already logged in…"
if ! supabase projects list &> /dev/null 2>&1; then
  info "Opening browser for authentication…"
  supabase login
else
  success "Already logged in"
fi

# ─── 3. Create or use existing project ───────────────────────────────────────
header "Supabase Project"
echo "Your organizations:"
supabase orgs list
echo ""
read -p "Enter org ID (from table above): " ORG_ID

read -p "Create a new project? [y/N]: " CREATE_NEW
if [[ "$CREATE_NEW" =~ ^[Yy]$ ]]; then
  read -p "Project name [lineup]: " PROJECT_NAME
  PROJECT_NAME="${PROJECT_NAME:-lineup}"
  read -p "Region [us-east-1]: " REGION
  REGION="${REGION:-us-east-1}"
  read -s -p "Database password (16+ chars, save this!): " DB_PASS
  echo ""

  info "Creating project '${PROJECT_NAME}'…"
  supabase projects create "$PROJECT_NAME" \
    --org-id "$ORG_ID" \
    --region "$REGION" \
    --db-password "$DB_PASS"

  echo ""
  info "Waiting a few seconds for project to provision…"
  sleep 5
fi

echo ""
echo "Your projects:"
supabase projects list
echo ""
read -p "Enter project ref (e.g. abcdefghijklmnop): " PROJECT_REF

# ─── 4. Get API keys ──────────────────────────────────────────────────────────
header "Fetching API Keys"
KEYS=$(supabase projects api-keys --project-ref "$PROJECT_REF" --output json 2>/dev/null)

ANON_KEY=$(echo "$KEYS" | python3 -c "import sys,json; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k['name']=='anon'))" 2>/dev/null || echo "")
SERVICE_KEY=$(echo "$KEYS" | python3 -c "import sys,json; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k['name']=='service_role'))" 2>/dev/null || echo "")

if [[ -z "$ANON_KEY" ]]; then
  warn "Could not auto-parse keys. Run manually:"
  info "  supabase projects api-keys --project-ref $PROJECT_REF"
  echo ""
  read -p "Paste anon key: " ANON_KEY
  read -p "Paste service_role key: " SERVICE_KEY
else
  success "Fetched API keys"
fi

SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# ─── 5. Write .env files ──────────────────────────────────────────────────────
header "Writing .env files"

write_api_env() {
cat > apps/api/.env <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}
WEB_URL=http://localhost:5173
ADMIN_URL=http://localhost:5174
PORT=3000
EOF
}

write_web_env() {
# Parents authenticate with pat_ access tokens stored in localStorage, not
# Supabase Auth — the parent-facing app only needs to know where the API is.
cat > apps/web/.env <<EOF
VITE_API_URL=http://localhost:3000
EOF
}

write_admin_env() {
cat > apps/admin/.env <<EOF
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
VITE_API_URL=http://localhost:3000
VITE_WEB_URL=http://localhost:5173
EOF
}

write_api_env   && success "apps/api/.env written"
write_web_env   && success "apps/web/.env written"
write_admin_env && success "apps/admin/.env written"

# ─── 6. Link and push migration ───────────────────────────────────────────────
header "Database Migration"
info "Linking to project ${PROJECT_REF}…"
supabase link --project-ref "$PROJECT_REF"

info "Pushing migration…"
supabase db push

success "Schema applied (teams, memberships, kids, sessions, attendance, announcements, api keys + RLS)"

# ─── 7. Create superadmin user ────────────────────────────────────────────────
header "Superadmin User"
SUPERADMIN_EMAIL="jakericciardi@gmail.com"
read -s -p "Set password for ${SUPERADMIN_EMAIL} (10+ chars): " SA_PASS
echo ""

# Create user via Supabase Auth API
CREATE_USER_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${SUPERADMIN_EMAIL}\",
    \"password\": \"${SA_PASS}\",
    \"email_confirm\": true,
    \"app_metadata\": { \"role\": \"superadmin\", \"tenant_id\": null }
  }")

USER_ID=$(echo "$CREATE_USER_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

if [[ -n "$USER_ID" && "$USER_ID" != "null" ]]; then
  success "Superadmin created: ${SUPERADMIN_EMAIL} (id: ${USER_ID})"
else
  # Check if user already exists
  EXISTING=$(echo "$CREATE_USER_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('msg', d.get('message','')))" 2>/dev/null || echo "")
  if echo "$EXISTING" | grep -qi "already"; then
    warn "User already exists — updating app_metadata…"
    # Patch existing user via SQL
    supabase db execute --project-ref "$PROJECT_REF" \
      --sql "UPDATE auth.users SET raw_app_meta_data = jsonb_build_object('role','superadmin','tenant_id',null,'provider','email','providers',ARRAY['email']::text[]) WHERE email = '${SUPERADMIN_EMAIL}';" 2>/dev/null \
      && success "app_metadata updated" \
      || warn "Could not auto-patch. Run the SQL in build-report.md manually."
  else
    warn "Unexpected response: $CREATE_USER_RESPONSE"
    warn "Run the SQL in build-report.md to set the superadmin role manually."
  fi
fi

# ─── 8. Install dependencies ──────────────────────────────────────────────────
header "Installing Dependencies"
npm install
success "Dependencies installed"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Start dev servers:  npm run dev"
echo ""
echo "  Manager/superadmin app:  http://localhost:5174"
echo "  Parent app:              http://localhost:5173"
echo "  API:                     http://localhost:3000"
echo ""
