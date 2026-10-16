#!/usr/bin/env bash
# Proves backups restore: dumps a database to a file, restores it into a temporary database named
# <database>_restore_test, compares the row count of every table of the public schema, drops the temporary database.
# Exit 0 only when every count matches. The source database is only read.
#
#   DATABASE_URL=postgres://candydati:candydati@localhost:5434/candydati docker/restore-test.sh
#
# Needs pg_dump, pg_restore and psql (the version of the server or newer). Run it on a quiet database (the api
# stopped, or no one working): rows written between the dump and the count make the comparison fail on purpose.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL of the database to test}"
here=$(cd "$(dirname "$0")" && pwd)
source_db=$(psql --no-psqlrc "$DATABASE_URL" -Atc 'select current_database()')
test_db="${source_db}_restore_test"
admin_url=${DATABASE_URL%/*}/postgres
test_url=${DATABASE_URL%/*}/${test_db}
work=$(mktemp -d)

cleanup() {
  psql --no-psqlrc "$admin_url" -Atqc "drop database if exists \"${test_db}\" with (force)" >/dev/null 2>&1 || true
  rm -rf "$work"
  echo "restore-test: temporary database ${test_db} dropped"
}
trap cleanup EXIT

counts() { # table<TAB>rows for every table of the public schema, sorted
  psql --no-psqlrc "$1" -Atq -F $'\t' -c "
    select table_name,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by 1"
}

psql --no-psqlrc "$admin_url" -Atqc "drop database if exists \"${test_db}\" with (force)" >/dev/null

# Same code path as the scheduled service: PG* variables from the URL, no upload.
url_re='^postgres(ql)?://([^:@/]+)(:([^@]*))?@([^:/]+)(:([0-9]+))?/([^?]+)'
[[ "$DATABASE_URL" =~ $url_re ]] || { echo "restore-test: DATABASE_URL must look like postgres://user:password@host:port/database" >&2; exit 2; }
export PGUSER=${BASH_REMATCH[2]} PGPASSWORD=${BASH_REMATCH[4]} PGHOST=${BASH_REMATCH[5]} PGPORT=${BASH_REMATCH[7]:-5432}
PGDATABASE=$source_db BACKUP_DIR="$work" BACKUP_UPLOAD=false "$here/backup.sh" once
dump=$(find "$work" -name '*.dump' | head -1)
[ -n "$dump" ] || { echo "restore-test: no dump was written" >&2; exit 1; }
source_counts=$(counts "$DATABASE_URL")

"$here/restore.sh" "$dump" --into "$test_db"
restored_counts=$(counts "$test_url")

echo "restore-test: rows per table (source | restored)"
paste <(echo "$source_counts") <(echo "$restored_counts" | cut -f2) | awk -F'\t' '{ printf "  %-40s %10s | %s\n", $1, $2, $3 }'
if [ "$source_counts" = "$restored_counts" ]; then
  echo "restore-test: OK, $(echo "$source_counts" | wc -l | tr -d ' ') tables with identical row counts"
else
  echo "restore-test: FAILED, counts differ:" >&2
  diff <(echo "$source_counts") <(echo "$restored_counts") >&2 || true
  exit 1
fi
