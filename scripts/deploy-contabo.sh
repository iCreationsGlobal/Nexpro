#!/usr/bin/env bash
#
# deploy-contabo.sh
#
# Deploy ABS API code on the Contabo VPS: git pull, migrate, restart nexpro-backend.
# From your laptop it asks for the SSH password, then runs the deploy over SSH.
#
# Usage (from your laptop):
#   ./scripts/deploy-contabo.sh
#   CONTABO_HOST=root@62.169.22.3 ./scripts/deploy-contabo.sh
#
# Already on the VPS:
#   ~/nexpro/scripts/deploy-contabo.sh --local
#
# Options:
#   --local                 Run on this machine (no SSH)
#   --remote                Force SSH to CONTABO_HOST
#   --branch=NAME           Git branch to pull (default: main)
#   --skip-migrate          Skip Backend npm install + migrate
#   --skip-restart          Pull only; do not restart the API
#   --no-health-check       Skip curl /health after restart
#   --build-apps            Also build Frontend + storefront on the VPS (slow; dashboard is usually Vercel)
#   --repo-root=PATH        Nexpro root on the VPS (default: ~/nexpro)
#   --api-url=URL           Health-check base (default: https://api.africanbusinesssuite.com)
#   -h, --help
#
# Environment:
#   CONTABO_HOST            Default: root@62.169.22.3
#   CONTABO_SSH_OPTS        Extra ssh options
#   CONTABO_SSH_PASSWORD    If set, skip the prompt (avoid leaving this in your shell history)
#                           Optional: brew install hudochenkov/sshpass/sshpass so the password
#                           is passed to SSH without a second prompt.
#   NEXPRO_REPO_ROOT        Override repo root on the target
#   API_URL
#
set -euo pipefail

SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

CONTABO_HOST="${CONTABO_HOST:-root@62.169.22.3}"
CONTABO_SSH_OPTS="${CONTABO_SSH_OPTS:-}"
CONTABO_SSH_PASSWORD="${CONTABO_SSH_PASSWORD:-}"
REPO_ROOT="${NEXPRO_REPO_ROOT:-}"
API_URL="${API_URL:-https://api.africanbusinesssuite.com}"
GIT_BRANCH="main"

FORCE_LOCAL=false
FORCE_REMOTE=false
DO_MIGRATE=true
DO_RESTART=true
DO_HEALTH_CHECK=true
DO_BUILD_APPS=false

ASKPASS_FILE=""

usage() {
  sed -n '3,34p' "$0" | sed 's/^# \{0,1\}//'
}

log() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ -n "$ASKPASS_FILE" && -f "$ASKPASS_FILE" ]]; then
    rm -f "$ASKPASS_FILE"
  fi
  unset CONTABO_SSH_PASSWORD SSHPASS
}
trap cleanup EXIT

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --local) FORCE_LOCAL=true; shift ;;
      --remote) FORCE_REMOTE=true; shift ;;
      --branch=*) GIT_BRANCH="${1#*=}"; shift ;;
      --skip-migrate) DO_MIGRATE=false; shift ;;
      --skip-restart) DO_RESTART=false; shift ;;
      --no-health-check) DO_HEALTH_CHECK=false; shift ;;
      --build-apps) DO_BUILD_APPS=true; shift ;;
      --repo-root=*) REPO_ROOT="${1#*=}"; shift ;;
      --api-url=*) API_URL="${1#*=}"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1 (use --help)" ;;
    esac
  done
}

on_vps_layout() {
  [[ -d "$HOME/nexpro/Backend" ]]
}

prompt_ssh_password() {
  if [[ -n "$CONTABO_SSH_PASSWORD" ]]; then
    log "Using CONTABO_SSH_PASSWORD from the environment."
    return
  fi
  local tty=/dev/tty
  [[ -r "$tty" && -w "$tty" ]] || die "No terminal to read the SSH password. Run this from a terminal, or set CONTABO_SSH_PASSWORD."
  printf 'SSH password for %s: ' "$CONTABO_HOST" > "$tty"
  IFS= read -r -s CONTABO_SSH_PASSWORD < "$tty" || true
  printf '\n' > "$tty"
  [[ -n "$CONTABO_SSH_PASSWORD" ]] || die "Empty password."
}

write_askpass() {
  ASKPASS_FILE="$(mktemp -t contabo-askpass)"
  chmod 700 "$ASKPASS_FILE"
  # Password stays in this helper only for the SSH call; trap deletes it.
  printf '#!/bin/sh\nprintf %%s\\n %s\n' "$(printf '%q' "$CONTABO_SSH_PASSWORD")" > "$ASKPASS_FILE"
}

ssh_with_password() {
  local -a ssh_cmd=(ssh)
  # shellcheck disable=SC2206
  [[ -n "$CONTABO_SSH_OPTS" ]] && ssh_cmd+=($CONTABO_SSH_OPTS)
  ssh_cmd+=(
    -o PreferredAuthentications=password,keyboard-interactive
    -o PubkeyAuthentication=no
    -o KbdInteractiveAuthentication=yes
    -o NumberOfPasswordPrompts=1
    -o StrictHostKeyChecking=accept-new
    "$CONTABO_HOST"
  )

  if command -v sshpass >/dev/null 2>&1; then
    SSHPASS="$CONTABO_SSH_PASSWORD" sshpass -e "${ssh_cmd[@]}" "$@"
    return
  fi

  write_askpass
  if DISPLAY="${DISPLAY:-:0}" \
    SSH_ASKPASS="$ASKPASS_FILE" \
    SSH_ASKPASS_REQUIRE=force \
    "${ssh_cmd[@]}" "$@"; then
    return
  fi

  warn "Password helper failed (install sshpass for a smoother prompt: brew install hudochenkov/sshpass/sshpass)."
  warn "Falling back to the OpenSSH password prompt on this terminal."
  "${ssh_cmd[@]}" "$@"
}

restart_backend() {
  command -v systemctl >/dev/null 2>&1 || die "systemctl not found. On the VPS run: systemctl restart nexpro-backend"

  local -a sysctl=(systemctl)
  if [[ "$(id -u)" -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 || die "Need root or sudo to restart nexpro-backend."
    sysctl=(sudo systemctl)
  fi

  # Do not probe list-unit-files — that listing is often empty over SSH even when
  # the unit exists. Always restart the same way ops does on the VPS.
  log "Restarting nexpro-backend via systemctl..."
  "${sysctl[@]}" restart nexpro-backend
  "${sysctl[@]}" --no-pager --full status nexpro-backend || true
}

smoke_test_health() {
  local health_url="${API_URL%/}/health"
  log "Smoke test: curl -fsS ${health_url}"
  if curl -fsS --max-time 20 "$health_url"; then
    printf '\n'
    log "Health check OK."
  else
    warn "Health check failed for ${health_url}"
    return 1
  fi
}

run_local_deploy() {
  if [[ -z "$REPO_ROOT" ]]; then
    if [[ -d "$HOME/nexpro/Backend" ]]; then
      REPO_ROOT="$(cd "$HOME/nexpro" && pwd)"
    elif [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/../Backend" ]]; then
      REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    else
      die "Could not detect Nexpro repo root. Set --repo-root=PATH."
    fi
  fi

  [[ -d "$REPO_ROOT/.git" ]] || die "Not a git repo: $REPO_ROOT"
  [[ -d "$REPO_ROOT/Backend" ]] || die "Missing $REPO_ROOT/Backend"

  cd "$REPO_ROOT"
  log "Repo:   $REPO_ROOT"
  log "Branch: $GIT_BRANCH"
  log "Before: $(git log -1 --oneline)"
  log "Remote: $(git remote get-url origin 2>/dev/null || echo '(none)')"

  local dirty
  dirty="$(git status --porcelain --untracked-files=no || true)"
  if [[ -n "$dirty" ]]; then
    warn "Tracked files have local changes; stashing them so pull can fast-forward:"
    git status --porcelain --untracked-files=no
    git stash push --quiet -m "deploy-contabo auto-stash $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log "Stashed. Review later with: git stash list"
  fi

  GIT_TERMINAL_PROMPT=0 git fetch origin "$GIT_BRANCH"
  git checkout "$GIT_BRANCH"
  GIT_TERMINAL_PROMPT=0 git pull --ff-only origin "$GIT_BRANCH"
  log "After:  $(git log -1 --oneline)"

  if [[ "$DO_MIGRATE" == true ]]; then
    log "Backend npm install..."
    (cd "$REPO_ROOT/Backend" && npm install)
    log "Running database migrations..."
    (cd "$REPO_ROOT/Backend" && npm run migrate)
  fi

  if [[ "$DO_BUILD_APPS" == true ]]; then
    log "Building Frontend on the VPS..."
    (cd "$REPO_ROOT/Frontend" && npm install && npm run build)
    if [[ -d "$REPO_ROOT/storefront" ]]; then
      log "Building storefront on the VPS..."
      (cd "$REPO_ROOT/storefront" && npm install && npm run build)
    fi
  fi

  if [[ "$DO_RESTART" == true ]]; then
    restart_backend
    if [[ "$DO_HEALTH_CHECK" == true ]]; then
      sleep 3
      smoke_test_health || true
    fi
  else
    log "Skipped API restart (--skip-restart)."
  fi

  log "Contabo API deploy done."
}

run_remote() {
  prompt_ssh_password

  log "SSH $CONTABO_HOST — pulling $GIT_BRANCH in ${REPO_ROOT:-~/nexpro} ..."

  local -a remote_args=(--local "--branch=$GIT_BRANCH" "--api-url=$API_URL")
  [[ "$DO_MIGRATE" != true ]] && remote_args+=(--skip-migrate)
  [[ "$DO_RESTART" != true ]] && remote_args+=(--skip-restart)
  [[ "$DO_HEALTH_CHECK" != true ]] && remote_args+=(--no-health-check)
  [[ "$DO_BUILD_APPS" == true ]] && remote_args+=(--build-apps)
  [[ -n "$REPO_ROOT" ]] && remote_args+=("--repo-root=$REPO_ROOT")

  [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/deploy-contabo.sh" ]] \
    || die "Cannot find local deploy-contabo.sh to send over SSH."

  ssh_with_password bash -s -- "${remote_args[@]}" < "$SCRIPT_DIR/deploy-contabo.sh"
}

main() {
  parse_args "$@"
  API_URL="${API_URL%/}"

  if [[ "$FORCE_LOCAL" == true && "$FORCE_REMOTE" == true ]]; then
    die "Use either --local or --remote, not both."
  fi

  local mode="remote"
  if [[ "$FORCE_LOCAL" == true ]]; then
    mode="local"
  elif [[ "$FORCE_REMOTE" == true ]]; then
    mode="remote"
  elif on_vps_layout; then
    mode="local"
  fi

  if [[ "$mode" == "local" ]]; then
    run_local_deploy
  else
    run_remote
  fi
}

main "$@"
