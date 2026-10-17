#!/usr/bin/env bash
# Candydati on a fresh Linux server, in one command:
#   curl -fsSL https://github.com/fabrilallo/candydati/releases/latest/download/install.sh | sudo bash
# Installs Docker when missing, asks a few questions (or reads them from the environment, CANDYDATI_YES=1), generates
# every secret, writes $CANDYDATI_DIR/.env and starts the published images with Caddy (automatic HTTPS) and daily
# backups. `install.sh --upgrade [version]` moves an installed server to another release (`candydati update` runs it).
# Everything is defined first and run on the last line, so a download cut in half executes nothing.
# shellcheck disable=SC2153 # the answers (SMTP_HOST, AGENT_MODEL...) are assigned by ask() through printf -v
set -euo pipefail

CANDYDATI_REPO="${CANDYDATI_REPO:-fabrilallo/candydati}"
CANDYDATI_DIR="${CANDYDATI_DIR:-/opt/candydati}"
CADDY_IP="172.31.77.11"
BIN_PATH="/usr/local/bin/candydati"
READY_TIMEOUT_SECONDS=300

say() { printf '%s\n' "$*"; }
warn() { printf 'candydati: %s\n' "$*" >&2; }
die() {
  warn "$*"
  exit 1
}

# ---------- Pure helpers (unit tested: tools/deploy/install.test.ts) ----------

valid_domain() { [[ $1 =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$ ]]; }
valid_email() { [[ $1 =~ ^[^[:space:]@\'\"\\]+@[a-z0-9.-]+\.[a-z]{2,63}$ ]]; }
valid_version() { [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; }
valid_port() { [[ $1 =~ ^[0-9]{1,5}$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535)); }

# Letters and digits from the kernel CSPRNG, exactly $1 characters.
random_secret() {
  local length=$1 out=''
  while ((${#out} < length)); do
    out+=$(head -c 96 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')
  done
  printf '%s' "${out:0:length}"
}

# Environment variable that holds the key of the provider in a "provider/model" string (apps/api/src/agent/config.ts).
provider_key_name() {
  case "${1%%/*}" in
    openai) echo OPENAI_API_KEY ;;
    anthropic) echo ANTHROPIC_API_KEY ;;
    google) echo GOOGLE_GENERATIVE_AI_API_KEY ;;
    mistral) echo MISTRAL_API_KEY ;;
    groq) echo GROQ_API_KEY ;;
    deepseek) echo DEEPSEEK_API_KEY ;;
    xai) echo XAI_API_KEY ;;
    openrouter) echo OPENROUTER_API_KEY ;;
    *) return 1 ;;
  esac
}

# One `.env` value for Docker Compose: single quotes are literal (no $ interpolation), a quote inside is \'.
env_quote() {
  local value=$1
  if [[ $value == *$'\n'* || $value == *$'\r'* || $value == *\\ || $value == *"\\'"* ]]; then
    return 1
  fi
  printf "'%s'" "${value//\'/\\\'}"
}

env_line() {
  local quoted
  quoted=$(env_quote "$2") || die "$1 contains a character the .env file cannot hold (a newline, or a backslash at the end or before a quote)"
  printf '%s=%s\n' "$1" "$quoted"
}

# The whole .env from the answers (globals A_*) and fresh secrets.
render_env() {
  printf '# Candydati, written by install.sh. Change it with: candydati config (it applies the change).\n'
  env_line CANDYDATI_VERSION "$A_VERSION"
  env_line COMPOSE_PROFILES "caddy,backup"
  env_line CANDYDATI_DOMAIN "$A_DOMAIN"
  env_line PLATFORM_URL "https://$A_DOMAIN"
  env_line PLATFORM_NAME "$A_NAME"
  env_line PLATFORM_SUPPORT_EMAIL "$A_ADMIN_EMAIL"
  env_line PLATFORM_DEFAULT_LOCALE "$A_LOCALE"
  env_line INSTANCE_ADMIN_EMAILS "$A_ADMIN_EMAIL"
  printf '\n# Only Caddy is reachable from outside; the web listens on the loopback and trusts Caddy alone.\n'
  env_line WEB_BIND 127.0.0.1
  env_line NUXT_TRUSTED_PROXY "$CADDY_IP"
  printf '\n# Secrets: generated on this server, never shown again. Keep a copy of this file somewhere safe.\n'
  env_line BETTER_AUTH_SECRET "$(random_secret 48)"
  env_line INBOUND_WEBHOOK_SECRET "$(random_secret 48)"
  env_line POSTGRES_PASSWORD "$(random_secret 32)"
  env_line S3_ACCESS_KEY candydati
  env_line S3_SECRET_KEY "$(random_secret 32)"
  printf '# One-time: creates the first owner at https://%s/signup?setup, then delete this line.\n' "$A_DOMAIN"
  env_line BOOTSTRAP_TOKEN "$A_BOOTSTRAP_TOKEN"
  printf '\n# Email\n'
  env_line EMAIL_PROVIDER "$A_EMAIL_PROVIDER"
  env_line EMAIL_FROM_LOCAL "${A_SENDER%@*}"
  env_line EMAIL_DOMAIN "${A_SENDER#*@}"
  if [[ $A_EMAIL_PROVIDER == resend ]]; then
    env_line RESEND_API_KEY "$A_RESEND_API_KEY"
  else
    env_line SMTP_HOST "$A_SMTP_HOST"
    env_line SMTP_PORT "$A_SMTP_PORT"
    env_line SMTP_SECURE "$A_SMTP_SECURE"
    env_line SMTP_USER "$A_SMTP_USER"
    env_line SMTP_PASSWORD "$A_SMTP_PASSWORD"
  fi
  if [[ -n $A_AGENT_MODEL ]]; then
    printf '\n# AI assistant (optional)\n'
    env_line AGENT_MODEL "$A_AGENT_MODEL"
    env_line FAST_MODEL "$A_FAST_MODEL"
    env_line "$(provider_key_name "$A_AGENT_MODEL")" "$A_AI_KEY"
  fi
}

# ---------- Questions ----------

TTY=/dev/tty

# ask NAME "question" [default] [secret]: keeps a value already in the environment; with CANDYDATI_YES=1 never prompts.
ask() {
  local name=$1 question=$2 default=${3:-} secret=${4:-} answer=''
  if [[ -n ${!name:-} ]]; then return 0; fi
  if [[ ${CANDYDATI_YES:-} == 1 ]]; then
    printf -v "$name" '%s' "$default"
    return 0
  fi
  local hint=''
  [[ -n $default ]] && hint=" [$default]"
  if [[ -n $secret ]]; then
    read -r -s -p "$question$hint: " answer <"$TTY"
    printf '\n' >&2
  else
    read -r -p "$question$hint: " answer <"$TTY"
  fi
  printf -v "$name" '%s' "${answer:-$default}"
}

collect_answers() {
  say "Candydati: a few questions. Press Enter to accept the value in brackets."
  ask CANDYDATI_DOMAIN "Address of the site (e.g. jobs.yourcompany.com)"
  A_DOMAIN=$(printf '%s' "$CANDYDATI_DOMAIN" | tr '[:upper:]' '[:lower:]')
  valid_domain "$A_DOMAIN" || die "not a domain name: $CANDYDATI_DOMAIN"
  ask CANDYDATI_NAME "Name shown in the app and in emails" "Candydati"
  A_NAME=$CANDYDATI_NAME
  ask CANDYDATI_ADMIN_EMAIL "Your email (administrator and support contact)"
  A_ADMIN_EMAIL=$CANDYDATI_ADMIN_EMAIL
  valid_email "$A_ADMIN_EMAIL" || die "not an email address: $A_ADMIN_EMAIL"
  ask CANDYDATI_LOCALE "Default language, it or en" "it"
  A_LOCALE=$CANDYDATI_LOCALE
  [[ $A_LOCALE == it || $A_LOCALE == en ]] || die "language must be it or en"
  collect_email
  collect_ai
}

collect_email() {
  ask CANDYDATI_EMAIL_PROVIDER "Email sending: resend or smtp" "smtp"
  A_EMAIL_PROVIDER=$CANDYDATI_EMAIL_PROVIDER
  local default_sender="noreply@$A_DOMAIN"
  if [[ $A_EMAIL_PROVIDER == resend ]]; then
    ask RESEND_API_KEY "Resend API key" "" secret
    A_RESEND_API_KEY=$RESEND_API_KEY
    [[ -n $A_RESEND_API_KEY ]] || die "the Resend API key is required"
  elif [[ $A_EMAIL_PROVIDER == smtp ]]; then
    ask SMTP_HOST "SMTP server (e.g. smtp.yourprovider.com)"
    ask SMTP_PORT "SMTP port (587 STARTTLS, 465 TLS)" "587"
    valid_port "$SMTP_PORT" || die "not a port: $SMTP_PORT"
    ask SMTP_SECURE "TLS from the first byte (true for port 465)" "$([[ $SMTP_PORT == 465 ]] && echo true || echo false)"
    ask SMTP_USER "SMTP user"
    ask SMTP_PASSWORD "SMTP password" "" secret
    [[ -n $SMTP_HOST && -n $SMTP_USER && -n $SMTP_PASSWORD ]] || die "SMTP server, user and password are required"
    A_SMTP_HOST=$SMTP_HOST A_SMTP_PORT=$SMTP_PORT A_SMTP_SECURE=$SMTP_SECURE A_SMTP_USER=$SMTP_USER A_SMTP_PASSWORD=$SMTP_PASSWORD
    [[ $SMTP_USER == *@* ]] && default_sender=$SMTP_USER
  else
    die "email sending must be resend or smtp"
  fi
  ask CANDYDATI_SENDER "Sender address of the emails" "$default_sender"
  A_SENDER=$(printf '%s' "$CANDYDATI_SENDER" | tr '[:upper:]' '[:lower:]')
  valid_email "$A_SENDER" || die "not an email address: $CANDYDATI_SENDER"
}

collect_ai() {
  ask AGENT_MODEL "AI assistant, optional: model as provider/model (Enter to skip)"
  A_AGENT_MODEL=$AGENT_MODEL A_FAST_MODEL='' A_AI_KEY=''
  [[ -z $A_AGENT_MODEL ]] && return 0
  local key_name
  key_name=$(provider_key_name "$A_AGENT_MODEL") || die "unknown AI provider in $A_AGENT_MODEL (openai, anthropic, google, mistral, groq, deepseek, xai, openrouter)"
  ask FAST_MODEL "Fast model for ad scores and CV reading" "$A_AGENT_MODEL"
  A_FAST_MODEL=$FAST_MODEL
  [[ ${FAST_MODEL%%/*} == "${A_AGENT_MODEL%%/*}" ]] || die "use the same provider for both models"
  ask "$key_name" "API key ($key_name)" "" secret
  A_AI_KEY=${!key_name}
  [[ -n $A_AI_KEY ]] || die "$key_name is required for the assistant"
}

# ---------- Server ----------

require_server() {
  [[ $(uname -s) == Linux ]] || die "this installer runs on a Linux server"
  [[ $EUID -eq 0 ]] || die "run it as root: curl -fsSL <url> | sudo bash"
  case "$(uname -m)" in
    x86_64 | amd64 | aarch64 | arm64) ;;
    *) die "unsupported processor $(uname -m): amd64 or arm64 only" ;;
  esac
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    say "Installing Docker (get.docker.com)..."
    curl -fsSL https://get.docker.com | sh
  fi
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing: install the docker-compose-plugin package"
  systemctl enable --now docker >/dev/null 2>&1 || true
}

# Only a warning: behind NAT the public address is not on an interface.
check_dns() {
  local resolved local_addresses
  resolved=$(getent ahosts "$A_DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u || true)
  if [[ -z $resolved ]]; then
    warn "$A_DOMAIN does not resolve yet: add a DNS A record to this server, HTTPS starts once it does"
    return 0
  fi
  local_addresses=$(hostname -I 2>/dev/null || true)
  local address
  for address in $resolved; do
    [[ " $local_addresses " == *" $address "* ]] && return 0
  done
  warn "$A_DOMAIN points to $(echo "$resolved" | tr '\n' ' ')which is not an address of this server (fine behind NAT)"
}

latest_version() {
  curl -fsSL "https://api.github.com/repos/$CANDYDATI_REPO/releases/latest" |
    sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1
}

resolve_version() {
  local version=${1:-}
  [[ -n $version ]] || version=$(latest_version) || true
  valid_version "$version" || die "no valid release found (got '$version'): set CANDYDATI_VERSION"
  printf '%s' "${version#v}"
}

# Release bundle (compose file, config check, Caddyfile, CLI) checked against the release's SHA256SUMS.
fetch_bundle() {
  local version=$1 tmp base
  base="https://github.com/$CANDYDATI_REPO/releases/download/v$version"
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/candydati-deploy.tar.gz" "$base/candydati-deploy.tar.gz"
  curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"
  (cd "$tmp" && grep ' candydati-deploy.tar.gz$' SHA256SUMS | sha256sum -c --status) || die "checksum mismatch for the release bundle"
  mkdir -p "$CANDYDATI_DIR"
  tar -xzf "$tmp/candydati-deploy.tar.gz" -C "$CANDYDATI_DIR"
  install -m 0755 "$CANDYDATI_DIR/deploy/candydati" "$BIN_PATH"
  rm -rf "$tmp"
}

compose() { docker compose --project-directory "$CANDYDATI_DIR" -f "$CANDYDATI_DIR/docker-compose.prod.yml" "$@"; }

start_stack() {
  say "Downloading the images and starting..."
  compose pull --quiet
  compose up -d --remove-orphans
  say "Waiting for the app (migrations run on the first start)..."
  local waited=0
  until curl -fsS -o /dev/null "http://127.0.0.1:3000/api/ready"; do
    ((waited >= READY_TIMEOUT_SECONDS)) && die "the app is not ready after ${READY_TIMEOUT_SECONDS}s: candydati logs"
    sleep 5
    waited=$((waited + 5))
  done
}

set_env_value() {
  local name=$1 line tmp
  line=$(env_line "$1" "$2")
  tmp=$(mktemp "$CANDYDATI_DIR/.env.XXXXXX")
  grep -v "^$name=" "$CANDYDATI_DIR/.env" >"$tmp" || true
  printf '%s\n' "$line" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$CANDYDATI_DIR/.env"
}

install_main() {
  require_server
  [[ -f $CANDYDATI_DIR/.env ]] && die "Candydati is already installed in $CANDYDATI_DIR: use candydati update"
  collect_answers
  ensure_docker
  check_dns
  A_VERSION=$(resolve_version "${CANDYDATI_VERSION:-}")
  A_BOOTSTRAP_TOKEN=$(random_secret 48)
  say "Installing Candydati $A_VERSION in $CANDYDATI_DIR..."
  fetch_bundle "$A_VERSION"
  (umask 077 && render_env >"$CANDYDATI_DIR/.env")
  start_stack
  say ""
  say "Candydati is running. Create the first account (owner) here:"
  # The code rides in the fragment: the browser never sends it, the form fills it in.
  say "  https://$A_DOMAIN/signup?setup#code=$A_BOOTSTRAP_TOKEN"
  say "Once you have confirmed your email the code opens nothing. Everyday commands: candydati help"
}

upgrade_main() {
  require_server
  [[ -f $CANDYDATI_DIR/.env ]] || die "no installation in $CANDYDATI_DIR: run the installer without --upgrade"
  local current target
  current=$(sed -n "s/^CANDYDATI_VERSION='\{0,1\}\([^']*\)'\{0,1\}$/\1/p" "$CANDYDATI_DIR/.env")
  target=$(resolve_version "${1:-}")
  if [[ $current == "$target" ]]; then
    say "Already on $target."
    return 0
  fi
  say "Backup before the update..."
  compose run --rm backup backup.sh once || die "the backup failed: nothing was changed"
  say "Updating $current -> $target..."
  fetch_bundle "$target"
  set_env_value CANDYDATI_VERSION "$target"
  start_stack
  say "Candydati $target is running."
}

main() {
  case "${1:-}" in
    --upgrade) upgrade_main "${2:-}" ;;
    "") install_main ;;
    *) die "usage: install.sh [--upgrade [version]]" ;;
  esac
}

if [[ ${CANDYDATI_INSTALL_LIB:-} != 1 ]]; then main "$@"; fi
