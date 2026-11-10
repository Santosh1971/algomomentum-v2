#!/usr/bin/env bash
# Changes ONLY the ENGINE_* switches in the bridge server's .env, then reloads the app.
# The account (ENGINE_RUNNER_ACCOUNT_ID) is never touched. .env is backed up first; other lines are never printed.
#
#   ./engine-env.sh status          show the ENGINE_ lines and whether the kill switch file exists
#   ./engine-env.sh canary          live mode, 1 lot max   (asks you to type YES first)
#   ./engine-env.sh lots 50         live mode, N lots max  (1-200; asks you to type YES first)
#   ./engine-env.sh shadow          back to log-only
#   ./engine-env.sh kill | unkill   create / remove the ENGINE_KILL file (live mode then refuses to trade)
# Add ssh options after the command, e.g.  ./engine-env.sh status -i ~/key
set -euo pipefail
# The server address is not stored in git (this repo is public). Put it in a file next to this script named
# .engine-host (git-ignored), one line, e.g.  user@host   -- or set ENGINE_HOST=user@host for one run.
HOSTFILE="$(cd "$(dirname "$0")" && pwd)/.engine-host"
HOST="${ENGINE_HOST:-}"
[ -n "$HOST" ] || { [ -f "$HOSTFILE" ] && HOST="$(head -n1 "$HOSTFILE")"; } || true
[ -n "$HOST" ] || { echo "Server address missing: create $HOSTFILE containing user@host (or set ENGINE_HOST)."; exit 1; }
DIR=/var/www/algomomentum
cmd=${1:-}; shift || true
LOTS=""
if [ "$cmd" = "lots" ]; then LOTS=${1:-}; shift || true; case "$LOTS" in ''|*[!0-9]*) echo "lots needs a whole number"; exit 1;; esac; [ "$LOTS" -ge 1 ] && [ "$LOTS" -le 200 ] || { echo "lots must be 1-200"; exit 1; }; fi
OPTS=("$@")
r() { ssh ${OPTS[@]+"${OPTS[@]}"} "$HOST" "$1"; }

show() { r "cd $DIR && grep -E '^ENGINE_(RUNNER_MODE|LIVE_CONFIRM|MAX_LOTS|MAX_BALANCE_USD|SIZE_FRACTION)=' .env || echo '(no mode/lots lines: shadow)'; [ -e ENGINE_KILL ] && echo 'KILL SWITCH IS ON' || echo 'kill switch off'; echo 'account id line present:' \$(grep -c '^ENGINE_RUNNER_ACCOUNT_ID=' .env)"; }

apply() { # $1 = lines to write (may be empty)
  r "cd $DIR && cp .env .env.bak.\$(date +%Y%m%d%H%M%S) && grep -v -E '^ENGINE_(RUNNER_MODE|LIVE_CONFIRM|MAX_LOTS)=' .env > .env.new; printf '%b' '$1' >> .env.new; cat .env.new > .env; rm -f .env.new; pm2 reload algomomentum --update-env >/dev/null && echo reloaded"
  show
}

confirm() { printf "This lets the engine place REAL orders on the account in ENGINE_RUNNER_ACCOUNT_ID (max %s lots). Type YES to continue: " "$1"; read -r a; [ "$a" = "YES" ] || { echo "cancelled"; exit 1; }; }

case "$cmd" in
  status) show ;;
  canary) confirm 1; apply 'ENGINE_RUNNER_MODE=live\nENGINE_LIVE_CONFIRM=PLACE_REAL_ORDERS\nENGINE_MAX_LOTS=1\n' ;;
  lots)   confirm "$LOTS"; apply "ENGINE_RUNNER_MODE=live\nENGINE_LIVE_CONFIRM=PLACE_REAL_ORDERS\nENGINE_MAX_LOTS=$LOTS\n" ;;
  shadow) apply 'ENGINE_RUNNER_MODE=shadow\n' ;;
  kill)   r "cd $DIR && touch ENGINE_KILL && echo 'kill switch ON'" ;;
  unkill) r "cd $DIR && rm -f ENGINE_KILL && echo 'kill switch off'" ;;
  *) sed -n 2,12p "$0"; exit 1 ;;
esac
