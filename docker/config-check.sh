#!/bin/sh
# Runs before every other service of docker-compose.prod.yml: refuses to start the stack with the example secrets of
# .env.example, short secrets, an http PLATFORM_URL (cookies would not be Secure) or EMAIL_PROVIDER=log.
# The api and the worker apply the same rules (and an entropy check) at boot; this only fails earlier and louder.
# Prints variable names, never values.
fail=0

refuse() {
  echo "config-check: $1" >&2
  fail=1
}

check_secret() {
  name=$1
  min=$2
  eval "value=\${$name:-}"
  lowered=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  case "$lowered" in
    *change-me* | *changeme* | *change_me* | *tt-minio-secret* | *minioadmin* | *example*)
      refuse "$name is an example value: generate one with: openssl rand -base64 48"
      return
      ;;
  esac
  if [ "${#value}" -lt "$min" ]; then refuse "$name must be at least $min characters"; fi
}

check_secret BETTER_AUTH_SECRET 32
check_secret INBOUND_WEBHOOK_SECRET 32
check_secret POSTGRES_PASSWORD 16
check_secret S3_SECRET_KEY 16

case "${PLATFORM_URL:-}" in
  https://*) ;;
  *) refuse "PLATFORM_URL must start with https:// (put a TLS reverse proxy in front of the web container)" ;;
esac

case "${EMAIL_PROVIDER:-log}" in
  smtp | resend) ;;
  *) refuse "EMAIL_PROVIDER must be smtp or resend: verification, password reset and invitation emails need a real provider" ;;
esac

if [ "$fail" -ne 0 ]; then
  echo "config-check: fix .env and run docker compose up again" >&2
  exit 1
fi
echo "config-check: ok"
