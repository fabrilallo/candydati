#!/usr/bin/env bash
# Restores a dump made by backup.sh into a database.
#
#   restore.sh <dump file> --into <database>             into a NEW database (refuses when it exists)
#   restore.sh <dump file> --into <database> --replace   drops it first: STOP the api and the worker before
#
# Connection: the standard PGHOST, PGPORT, PGUSER, PGPASSWORD. The user needs CREATEDB.
# A .enc file is decrypted with BACKUP_ENCRYPTION_PASSPHRASE; a .sha256 next to the file is verified first.
# The api applies the migrations missing from an older dump at its next start (RUN_MIGRATIONS=true).
set -euo pipefail

log() { printf 'restore: %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

file=${1:-}
[ -f "$file" ] || die "usage: restore.sh <dump file> --into <database> [--replace]"
shift
target=""
replace=false
while [ $# -gt 0 ]; do
  case "$1" in
    --into) target=${2:-}; shift 2 ;;
    --replace) replace=true; shift ;;
    *) die "unknown option $1" ;;
  esac
done
[[ "$target" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "--into needs a database name (letters, digits, underscore)"

if [ -f "${file}.sha256" ]; then
  expected=$(cut -d' ' -f1 "${file}.sha256")
  actual=$(if command -v sha256sum >/dev/null; then sha256sum "$file"; else shasum -a 256 "$file"; fi | cut -d' ' -f1)
  [ "$expected" = "$actual" ] || die "checksum mismatch: the file is damaged"
  log "checksum ok"
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dump=$file
if [[ "$file" == *.enc ]]; then
  [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] || die "the file is encrypted: set BACKUP_ENCRYPTION_PASSPHRASE"
  dump="$work/restore.dump"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$file" -out "$dump" || die "cannot decrypt (wrong passphrase?)"
fi
pg_restore --list "$dump" >/dev/null || die "not a valid custom-format dump"

exists=$(psql --no-psqlrc -d postgres -Atc "select 1 from pg_database where datname = '${target}'")
if [ -n "$exists" ]; then
  $replace || die "database ${target} exists: use --replace to drop it first"
  psql --no-psqlrc -d postgres -v ON_ERROR_STOP=1 -c "drop database \"${target}\" with (force)"
fi
psql --no-psqlrc -d postgres -v ON_ERROR_STOP=1 -c "create database \"${target}\""
log "restoring into ${target}"
pg_restore --dbname="$target" --no-owner --no-acl --exit-on-error "$dump"
log "done: ${target} restored from ${file##*/}"
