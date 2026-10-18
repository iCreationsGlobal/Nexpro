#!/usr/bin/env bash
#
# backup-database.sh
#
# Back up the ABS database to a single file, using the DATABASE_URL the API uses.
# Run it on the Contabo VPS before a deploy (deploy-contabo.sh also does this itself).
#
# Usage (on the VPS):
#   ~/nexpro/scripts/backup-database.sh
#   ~/backup-database.sh --keep=10
#
# Options:
#   --env-file=PATH   File with DATABASE_URL (default: ~/nexpro/Backend/.env)
#   --dir=PATH        Where backups go (default: ~/nexpro-backups)
#   --keep=N          After a good backup, delete all but the newest N backups (default: keep all)
#   -h, --help
#
# Environment:
#   DATABASE_URL      Used when set, instead of reading the env file
#
# Restore (replaces the data in that database with the backup):
#   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" ~/nexpro-backups/abs-<time>.dump
#
set -euo pipefail

ENV_FILE="$HOME/nexpro/Backend/.env"
BACKUP_DIR="${NEXPRO_BACKUP_DIR:-$HOME/nexpro-backups}"
KEEP=""

usage() {
  sed -n '3,24p' "$0" | sed 's/^# \{0,1\}//'
}

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env-file=*) ENV_FILE="${1#*=}"; shift ;;
      --dir=*) BACKUP_DIR="${1#*=}"; shift ;;
      --keep=*) KEEP="${1#*=}"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1 (use --help)" ;;
    esac
  done
  if [[ -n "$KEEP" && ! "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
    die "--keep must be a number of backups, 1 or more."
  fi
}

resolve_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    printf '%s' "$DATABASE_URL"
    return
  fi
  [[ -f "$ENV_FILE" ]] || die "No DATABASE_URL set and $ENV_FILE not found. Use --env-file=PATH."
  local url
  url="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"]$//")"
  [[ -n "$url" ]] || die "DATABASE_URL is not set in $ENV_FILE."
  printf '%s' "$url"
}

# Database host only, so the password never reaches the screen.
describe_database() {
  printf '%s' "$1" | sed -E 's#^[a-z]+://([^@]*@)?([^/:?]+).*#\2#'
}

prune_old_backups() {
  [[ -n "$KEEP" ]] || return 0
  local old n=0
  while IFS= read -r old; do
    n=$((n + 1))
    (( n > KEEP )) || continue
    rm -f "$old"
    log "Deleted old backup: $old"
  done < <(ls -1t "$BACKUP_DIR"/abs-*.dump 2>/dev/null || true)
}

main() {
  parse_args "$@"

  command -v pg_dump >/dev/null 2>&1 \
    || die "pg_dump not found. Install the PostgreSQL client: apt install postgresql-client"
  command -v pg_restore >/dev/null 2>&1 \
    || die "pg_restore not found. Install the PostgreSQL client: apt install postgresql-client"

  local db_url
  db_url="$(resolve_database_url)"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  local file="$BACKUP_DIR/abs-$(date -u +%Y%m%dT%H%M%SZ).dump"

  log "Database: $(describe_database "$db_url")"
  log "pg_dump:  $(pg_dump --version)"
  log "Saving:   $file"

  if ! pg_dump "$db_url" --format=custom --no-owner --file="$file"; then
    rm -f "$file"
    die "Backup failed. If it says \"server version mismatch\", install a pg_dump at least as new as the database server (e.g. apt install postgresql-client-17 from apt.postgresql.org)."
  fi
  chmod 600 "$file"

  # Read the file back so a broken backup is caught now, not when it's needed.
  local listing tables
  listing="$(pg_restore --list "$file")" || die "The backup file can't be read back: $file"
  tables="$(printf '%s\n' "$listing" | grep -c ' TABLE DATA ' || true)"
  [[ "$tables" -gt 0 ]] || die "The backup has no table data: $file"

  log "Done:     $(du -h "$file" | cut -f1), $tables tables."
  prune_old_backups
  log ""
  log "To restore it (replaces the data in that database):"
  log "  pg_restore --clean --if-exists --no-owner -d \"\$DATABASE_URL\" $file"
}

main "$@"
