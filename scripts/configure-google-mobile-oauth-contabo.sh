#!/usr/bin/env bash
#
# configure-google-mobile-oauth-contabo.sh
#
# Upsert ABS Google mobile OAuth client IDs on Contabo production Backend/.env:
#   GOOGLE_IOS_CLIENT_ID=...
#   GOOGLE_ANDROID_CLIENT_ID=...
#
# Safe to re-run: backs up Backend/.env first, then optionally restarts nexpro-backend
# and checks GET /api/auth/config for googleIosClientId / googleAndroidClientId.
#
# Prerequisites:
#   - Backend code that exposes googleIosClientId / googleAndroidClientId on /api/auth/config
#     and accepts those audiences in googleAuth (deploy main to Contabo first if missing).
#   - SSH access to CONTABO_HOST (or run --local on the VPS).
#
# Usage (from your laptop):
#   ./scripts/configure-google-mobile-oauth-contabo.sh
#   CONTABO_HOST=root@62.169.22.3 ./scripts/configure-google-mobile-oauth-contabo.sh
#
# Override IDs:
#   GOOGLE_IOS_CLIENT_ID=xxx.apps.googleusercontent.com \
#   GOOGLE_ANDROID_CLIENT_ID=yyy.apps.googleusercontent.com \
#   ./scripts/configure-google-mobile-oauth-contabo.sh
#
# On the VPS:
#   ~/nexpro/scripts/configure-google-mobile-oauth-contabo.sh --local
#
# Options:
#   --local                 Run on this machine (no SSH)
#   --remote                Force SSH to CONTABO_HOST
#   --env-only              Update .env only (no restart, no config check)
#   --restart               Restart backend after env update (default unless --env-only)
#   --no-config-check       Skip curl /api/auth/config verification
#   --repo-root=PATH        Nexpro root on target (default: ~/nexpro)
#   --api-url=URL           Config check base (default: https://api.africanbusinesssuite.com)
#   -h, --help
#
# Environment:
#   CONTABO_HOST            Default: root@62.169.22.3
#   CONTABO_SSH_OPTS        Extra ssh options
#   NEXPRO_REPO_ROOT        Override repo root
#   GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID
#   API_URL
#
set -euo pipefail

SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

# Defaults = production ABS mobile OAuth clients (Google Cloud).
GOOGLE_IOS_CLIENT_ID="${GOOGLE_IOS_CLIENT_ID:-1037293408362-70q26ncoriuncj0mutbebs5cmdrru4uu.apps.googleusercontent.com}"
GOOGLE_ANDROID_CLIENT_ID="${GOOGLE_ANDROID_CLIENT_ID:-1037293408362-9bhje792c3roo4r17f7ig5vi6d2891k4.apps.googleusercontent.com}"
API_URL="${API_URL:-https://api.africanbusinesssuite.com}"
CONTABO_HOST="${CONTABO_HOST:-root@62.169.22.3}"
CONTABO_SSH_OPTS="${CONTABO_SSH_OPTS:-}"
REPO_ROOT="${NEXPRO_REPO_ROOT:-}"

FORCE_LOCAL=false
FORCE_REMOTE=false
ENV_ONLY=false
DO_RESTART=true
DO_CONFIG_CHECK=true

usage() {
  sed -n '3,45p' "$0" | sed 's/^# \{0,1\}//'
}

log() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --local) FORCE_LOCAL=true; shift ;;
      --remote) FORCE_REMOTE=true; shift ;;
      --env-only) ENV_ONLY=true; DO_RESTART=false; shift ;;
      --restart) DO_RESTART=true; shift ;;
      --no-config-check) DO_CONFIG_CHECK=false; shift ;;
      --repo-root=*) REPO_ROOT="${1#*=}"; shift ;;
      --api-url=*) API_URL="${1#*=}"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1 (use --help)" ;;
    esac
  done
}

detect_repo_root() {
  if [[ -n "$REPO_ROOT" ]]; then
    REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
    return
  fi
  if [[ -d "$HOME/nexpro/Backend" ]]; then
    REPO_ROOT="$(cd "$HOME/nexpro" && pwd)"
    return
  fi
  if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../Backend" ]]; then
    REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    return
  fi
  die "Could not detect Nexpro repo root. Set --repo-root=PATH or NEXPRO_REPO_ROOT."
}

on_vps_layout() {
  [[ -d "$HOME/nexpro/Backend" ]]
}

set_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  touch "$file"

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    awk -v key="$key" -v val="$value" '
      BEGIN { replaced = 0 }
      $0 ~ "^" key "=" {
        print key "=" val
        replaced = 1
        next
      }
      { print }
      END { if (!replaced) print key "=" val }
    ' "$file" > "$tmp"
  else
    cp "$file" "$tmp"
    printf '\n%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$file"
}

backup_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  cp -a "$file" "${file}.bak.${stamp}"
  log "Backed up $(basename "$file") -> $(basename "$file").bak.${stamp}"
}

restart_backend() {
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl list-unit-files 2>/dev/null | grep -q '^nexpro-backend\.service' \
      || systemctl is-active --quiet nexpro-backend 2>/dev/null; then
      log "Restarting nexpro-backend via systemctl..."
      sudo systemctl restart nexpro-backend
      sudo systemctl --no-pager --full status nexpro-backend || true
      return 0
    fi
  fi

  if command -v pm2 >/dev/null 2>&1; then
    if pm2 describe nexpro-backend >/dev/null 2>&1; then
      log "Restarting nexpro-backend via pm2..."
      pm2 restart nexpro-backend
      return 0
    fi
    if pm2 describe backend >/dev/null 2>&1; then
      log "Restarting backend via pm2..."
      pm2 restart backend
      return 0
    fi
  fi

  warn "No nexpro-backend systemd unit or pm2 process found; skipped restart."
  return 1
}

mask_client_id() {
  local id="${1:-}"
  if [[ ${#id} -le 28 ]]; then
    printf '%s' "$id"
    return
  fi
  printf '%s…' "${id:0:28}"
}

# Backend often needs >2s after systemctl restart (DB pool, migrations). Avoid false 502s.
wait_for_api_ready() {
  local health_url="${API_URL%/}/health"
  local attempt
  log "Waiting for API to become ready ($health_url) ..."
  for attempt in $(seq 1 30); do
    if curl -fsS -m 5 "$health_url" >/dev/null 2>&1; then
      log "API healthy after ${attempt} attempt(s)."
      return 0
    fi
    sleep 2
  done
  warn "API still not healthy after ~60s — config check may fail with 502."
  return 1
}

apply_env_locally() {
  detect_repo_root
  local env_file="$REPO_ROOT/Backend/.env"
  [[ -d "$REPO_ROOT/Backend" ]] || die "Backend folder missing at $REPO_ROOT/Backend"
  [[ -f "$env_file" ]] || die "Missing $env_file"

  log "Repo: $REPO_ROOT"
  log "Env file: $env_file"
  log "Setting GOOGLE_IOS_CLIENT_ID=$(mask_client_id "$GOOGLE_IOS_CLIENT_ID")"
  log "Setting GOOGLE_ANDROID_CLIENT_ID=$(mask_client_id "$GOOGLE_ANDROID_CLIENT_ID")"

  backup_file "$env_file"
  set_env_var "$env_file" "GOOGLE_IOS_CLIENT_ID" "$GOOGLE_IOS_CLIENT_ID"
  set_env_var "$env_file" "GOOGLE_ANDROID_CLIENT_ID" "$GOOGLE_ANDROID_CLIENT_ID"
  log "Updated Google mobile OAuth env keys."

  if [[ "$DO_RESTART" == true ]]; then
    restart_backend || true
  else
    log "Skipped restart (--env-only)."
  fi
}

verify_public_config() {
  local url="${API_URL%/}/api/auth/config"
  log "Checking $url ..."
  local body
  if ! body="$(curl -fsS -m 20 "$url")"; then
    die "Could not fetch $url"
  fi

  if ! printf '%s' "$body" | grep -q 'googleIosClientId'; then
    warn "Response has no googleIosClientId — deploy latest Backend (multi-client Google auth) to Contabo, then re-run."
    printf '%s\n' "$body"
    return 1
  fi

  local ios android
  ios="$(printf '%s' "$body" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("googleIosClientId") or "")' 2>/dev/null || true)"
  android="$(printf '%s' "$body" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("googleAndroidClientId") or "")' 2>/dev/null || true)"

  log "Live googleIosClientId=$(mask_client_id "$ios")"
  log "Live googleAndroidClientId=$(mask_client_id "$android")"

  if [[ -z "$ios" || -z "$android" ]]; then
    die "Config returned empty mobile client IDs. Confirm Backend/.env and that the process was restarted."
  fi

  if [[ "$ios" != "$GOOGLE_IOS_CLIENT_ID" ]]; then
    warn "Live iOS client ID does not match the value just written (CDN/cache or wrong host?)."
  fi
  if [[ "$android" != "$GOOGLE_ANDROID_CLIENT_ID" ]]; then
    warn "Live Android client ID does not match the value just written (CDN/cache or wrong host?)."
  fi

  log "OK — Google mobile OAuth client IDs are live."
}

run_remote() {
  local local_script=""
  if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/configure-google-mobile-oauth-contabo.sh" ]]; then
    local_script="$SCRIPT_DIR/configure-google-mobile-oauth-contabo.sh"
  elif [[ -f "./scripts/configure-google-mobile-oauth-contabo.sh" ]]; then
    local_script="./scripts/configure-google-mobile-oauth-contabo.sh"
  else
    die "Cannot find local configure-google-mobile-oauth-contabo.sh to send over SSH."
  fi

  local remote_args=(--local)
  [[ "$ENV_ONLY" == true ]] && remote_args+=(--env-only)
  [[ "$DO_RESTART" == true && "$ENV_ONLY" != true ]] && remote_args+=(--restart)
  [[ "$DO_CONFIG_CHECK" == false ]] && remote_args+=(--no-config-check)

  log "SSH $CONTABO_HOST (piping local script) ..."
  # shellcheck disable=SC2086
  ssh $CONTABO_SSH_OPTS "$CONTABO_HOST" \
    "GOOGLE_IOS_CLIENT_ID=$(printf '%q' "$GOOGLE_IOS_CLIENT_ID") \
     GOOGLE_ANDROID_CLIENT_ID=$(printf '%q' "$GOOGLE_ANDROID_CLIENT_ID") \
     API_URL=$(printf '%q' "$API_URL") \
     NEXPRO_REPO_ROOT=\${NEXPRO_REPO_ROOT:-\$HOME/nexpro} \
     bash -s -- $(printf '%q ' "${remote_args[@]}")" \
    < "$local_script"
}

main() {
  parse_args "$@"

  [[ -n "$GOOGLE_IOS_CLIENT_ID" ]] || die "GOOGLE_IOS_CLIENT_ID is empty"
  [[ -n "$GOOGLE_ANDROID_CLIENT_ID" ]] || die "GOOGLE_ANDROID_CLIENT_ID is empty"
  [[ "$GOOGLE_IOS_CLIENT_ID" == *.apps.googleusercontent.com ]] || die "GOOGLE_IOS_CLIENT_ID looks invalid"
  [[ "$GOOGLE_ANDROID_CLIENT_ID" == *.apps.googleusercontent.com ]] || die "GOOGLE_ANDROID_CLIENT_ID looks invalid"

  local mode="remote"
  if [[ "$FORCE_LOCAL" == true ]]; then
    mode="local"
  elif [[ "$FORCE_REMOTE" == true ]]; then
    mode="remote"
  elif on_vps_layout; then
    mode="local"
  fi

  if [[ "$mode" == "local" ]]; then
    apply_env_locally
    if [[ "$DO_CONFIG_CHECK" == true && "$ENV_ONLY" != true ]]; then
      wait_for_api_ready
      verify_public_config || true
    fi
  else
    run_remote
  fi
}

main "$@"
