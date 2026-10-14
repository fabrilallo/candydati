#!/usr/bin/env bash
# Scheduled logical backups of the database: pg_dump in custom format, checked, optionally encrypted, kept N days on a
# volume and optionally uploaded to S3 under a prefix. Used by the `backup` service of docker-compose.prod.yml; also
# runnable by hand (it needs pg_dump, pg_restore, curl and sha256sum).
#
#   backup.sh once    one backup now
#   backup.sh loop    one at start (BACKUP_ON_START=false to skip) and then every day at BACKUP_AT (UTC)
#
# Connection: the standard PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
# Other settings (all optional): BACKUP_DIR=/backups, BACKUP_RETENTION_DAYS=14, BACKUP_AT=02:30,
# BACKUP_ENCRYPTION_PASSPHRASE (AES-256 with openssl; keep it somewhere else than the backups),
# BACKUP_UPLOAD=true|false and, with upload: BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_REGION,
# BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY, BACKUP_S3_PREFIX=backups/, BACKUP_S3_PATH_STYLE=true,
# BACKUP_S3_SSE=AES256|aws:kms (empty: none). Prints names and sizes, never credentials.
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
UPLOAD=${BACKUP_UPLOAD:-false}
PREFIX=${BACKUP_S3_PREFIX:-backups/}
EMPTY_SHA256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

# sha256sum on Linux, shasum on macOS.
sha256_of() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[[ "$PREFIX" =~ ^[A-Za-z0-9._/-]*$ ]] || die "BACKUP_S3_PREFIX may only contain letters, digits and . _ / -"
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [ "$RETENTION_DAYS" -ge 1 ] || die "BACKUP_RETENTION_DAYS must be a whole number of days (at least 1)"

# ---------- S3 (curl with AWS Signature V4: no extra tool in the image) ----------
s3_url() {
  local key=$1 endpoint=${BACKUP_S3_ENDPOINT%/}
  if [ "${BACKUP_S3_PATH_STYLE:-true}" = "true" ]; then
    printf '%s/%s/%s' "$endpoint" "$BACKUP_S3_BUCKET" "$key"
  else
    printf '%s://%s.%s/%s' "${endpoint%%://*}" "$BACKUP_S3_BUCKET" "${endpoint#*://}" "$key"
  fi
}

s3_curl() {
  curl --fail --silent --show-error --retry 3 --max-time 3600 \
    --aws-sigv4 "aws:amz:${BACKUP_S3_REGION:-us-east-1}:s3" --user "${BACKUP_S3_ACCESS_KEY}:${BACKUP_S3_SECRET_KEY}" "$@"
}

s3_put() { # file key
  local hash sse=()
  hash=$(sha256_of "$1")
  [ -n "${BACKUP_S3_SSE:-}" ] && sse=(-H "x-amz-server-side-encryption: ${BACKUP_S3_SSE}")
  s3_curl -X PUT -T "$1" -H "x-amz-content-sha256: ${hash}" "${sse[@]}" "$(s3_url "$2")" >/dev/null
}

s3_keys() { # keys under the prefix, one per line (first 1000: a daily backup is years of room)
  local endpoint=${BACKUP_S3_ENDPOINT%/} base body
  if [ "${BACKUP_S3_PATH_STYLE:-true}" = "true" ]; then base="${endpoint}/${BACKUP_S3_BUCKET}"; else base="${endpoint%%://*}://${BACKUP_S3_BUCKET}.${endpoint#*://}"; fi
  # curl signs the query as given: a raw "/" in the prefix would not match what the server computes, so it is %2F.
  body=$(s3_curl -H "x-amz-content-sha256: ${EMPTY_SHA256}" "${base}?list-type=2&prefix=${PREFIX//\//%2F}") || return 1
  { grep -o '<Key>[^<]*</Key>' <<<"$body" || true; } | sed -e 's#<Key>##' -e 's#</Key>##'
}

s3_delete() { s3_curl -X DELETE -H "x-amz-content-sha256: ${EMPTY_SHA256}" "$(s3_url "$1")" >/dev/null; }

require_upload_settings() {
  for name in BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY; do
    [ -n "${!name:-}" ] || { log "ERROR: BACKUP_UPLOAD is true but ${name} is empty"; return 1; }
  done
}

# ---------- one backup ----------
timestamp_of() { # backup-20260101T020000Z.dump[.enc] -> 20260101T020000Z
  sed -E 's/.*-([0-9]{8}T[0-9]{6}Z)\.dump.*/\1/' <<<"$1"
}

prune_local() {
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.dump.enc' -o -name '*.sha256' \) -mtime "+${RETENTION_DAYS}" -print -delete \
    | while read -r file; do log "removed ${file##*/} (older than ${RETENTION_DAYS} days)"; done
}

prune_remote() {
  local cutoff key stamp keys
  cutoff=$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%dT%H%M%SZ)
  keys=$(s3_keys) || return 1
  while read -r key; do
    case "$key" in *.dump | *.dump.enc) ;; *) continue ;; esac
    stamp=$(timestamp_of "$key")
    if [[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] && [[ "$stamp" < "$cutoff" ]]; then
      s3_delete "$key" && log "removed s3 ${key} (older than ${RETENTION_DAYS} days)"
    fi
  done <<<"$keys"
}

backup_once() {
  mkdir -p "$BACKUP_DIR"
  local stamp name partial final
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="${PGDATABASE}-${stamp}.dump"
  partial="${BACKUP_DIR}/${name}.partial"
  final="${BACKUP_DIR}/${name}"
  trap 'rm -f "$partial" "$partial.enc"' RETURN

  # Every step ends with `|| return 1`: the loop calls this function in an `||` list, where `set -e` does not apply.
  log "dumping ${PGDATABASE} on ${PGHOST:-localhost}"
  pg_dump --format=custom --compress=6 --no-owner --no-acl --file="$partial" || { log "ERROR: pg_dump failed"; return 1; }
  # A dump that cannot be listed cannot be restored: fail now, not at the worst moment.
  pg_restore --list "$partial" >/dev/null || { log "ERROR: the dump failed its integrity check"; return 1; }

  if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$partial" -out "${partial}.enc" || { log "ERROR: encryption failed"; return 1; }
    mv "${partial}.enc" "${final}.enc"
    final="${final}.enc"
  else
    mv "$partial" "$final"
  fi
  printf '%s  %s\n' "$(sha256_of "$final")" "${final##*/}" >"${final}.sha256"
  log "wrote ${final##*/} ($(du -h "$final" | cut -f1))"

  if [ "$UPLOAD" = "true" ]; then
    require_upload_settings || return 1
    s3_put "$final" "${PREFIX}${final##*/}" || { log "ERROR: upload to S3 failed (the local copy is kept)"; return 1; }
    log "uploaded ${PREFIX}${final##*/} to bucket ${BACKUP_S3_BUCKET}${BACKUP_S3_SSE:+ (server-side encryption ${BACKUP_S3_SSE})}"
    prune_remote || log "WARNING: could not prune old backups in S3 (are the list and delete permissions granted?)"
  fi
  prune_local
  date -u +%Y-%m-%dT%H:%M:%SZ >"${BACKUP_DIR}/last-success"
  log "done"
}

seconds_until() { # HH:MM (UTC) -> seconds until the next one
  local now target
  now=$(date -u +%s)
  target=$(date -u -d "today ${1}" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  echo $((target - now))
}

run_loop() {
  [[ "${BACKUP_AT:-02:30}" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BACKUP_AT must be HH:MM (UTC)"
  [ "${BACKUP_ON_START:-true}" = "true" ] && { backup_once || log "the first backup failed, will retry at the next schedule"; }
  while true; do
    local wait
    wait=$(seconds_until "${BACKUP_AT:-02:30}")
    log "next backup in ${wait}s (at ${BACKUP_AT:-02:30} UTC)"
    sleep "$wait"
    backup_once || log "the backup failed (the previous ones are untouched); next at the next schedule"
  done
}

case "${1:-}" in
  once) backup_once ;;
  loop) run_loop ;;
  *) echo "usage: backup.sh once|loop" >&2; exit 2 ;;
esac
