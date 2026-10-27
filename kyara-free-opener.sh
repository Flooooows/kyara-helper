#!/usr/bin/env bash
# Opens exactly one available free Kyara booster. Run only on an account where
# automated opening is permitted by Kyara's rules.

set -euo pipefail

readonly APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly URL="https://kyara.games/ouvrir/all"
readonly SESSION="kyara-free-opener"
readonly STATE_FILE="$APP_DIR/kyara-storage-state.json"
readonly STATS_FILE="$APP_DIR/opened-boosters.tsv"
readonly PWCLI="${PWCLI:-$HOME/.config/opencode/vendor/openai-skills/skills/.curated/playwright/scripts/playwright_cli.sh}"

if [[ ! -x "$PWCLI" ]]; then
  echo "Playwright CLI introuvable : $PWCLI" >&2
  exit 1
fi

usage() {
  cat <<'EOF'
Usage: ./kyara-free-opener.sh <init|run|dry-run|stats>

  init     Ouvre Kyara pour vous connecter, puis sauvegarde la session.
  run      Ouvre exactement un booster gratuit s'il est disponible.
  dry-run  Vérifie seulement si le bouton « Open Free » est disponible.
  stats    Affiche le nombre de boosters ouverts par le programme.
EOF
}

close_browser() {
  "$PWCLI" --session "$SESSION" close >/dev/null 2>&1 || true
}

ensure_npx() {
  if command -v npx >/dev/null 2>&1; then
    return 0
  fi

  # cron starts with a minimal PATH and does not load .zshrc/.bashrc, where
  # NVM is commonly initialized. Load its default Node version explicitly.
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$nvm_dir/nvm.sh"
    nvm use --silent default >/dev/null 2>&1 || true
  fi

  if ! command -v npx >/dev/null 2>&1; then
    echo "npx est introuvable. Installez Node.js ou définissez NVM_DIR." >&2
    exit 1
  fi
}

show_stats() {
  local total today last_opening

  if [[ ! -f "$STATS_FILE" ]]; then
    echo "Boosters ouverts par le programme : 0"
    echo "Le compteur démarre à partir de cette version du script."
    return 0
  fi

  total="$(wc -l < "$STATS_FILE" | tr -d ' ')"
  today="$(awk -v date="$(date +%F)" '$1 ~ "^" date { count++ } END { print count + 0 }' "$STATS_FILE")"
  last_opening="$(tail -n 1 "$STATS_FILE" | cut -f 1)"

  echo "Boosters ouverts par le programme : $total"
  echo "Ouverts aujourd'hui : $today"
  echo "Dernière ouverture : $last_opening"
}

record_opening() {
  umask 077
  printf '%s\tfree-booster\n' "$(date --iso-8601=seconds)" >> "$STATS_FILE"
  chmod 600 "$STATS_FILE"
}

initialize() {
  umask 077
  ensure_npx
  echo "Connexion à Kyara… connectez-vous si nécessaire."
  "$PWCLI" --session "$SESSION" open "$URL" --headed
  echo
  read -r -p "Une fois connecté et la page des boosters chargée, appuyez sur Entrée : "
  "$PWCLI" --session "$SESSION" state-save "$STATE_FILE"
  chmod 600 "$STATE_FILE"
  close_browser
  echo "Session sauvegardée dans $STATE_FILE"
}

open_free_booster() {
  ensure_npx

  if [[ ! -f "$STATE_FILE" ]]; then
    echo "Session absente. Lancez d'abord : $0 init" >&2
    exit 1
  fi

  # Prevent two scheduler invocations from opening two boosters at once.
  exec 9>"$APP_DIR/.run.lock"
  flock -n 9 || {
    echo "Une exécution est déjà en cours."
    exit 0
  }

  trap close_browser EXIT
  # state-load needs an active browser context. Load it before navigating to
  # Kyara so cookies and local storage are available to the site immediately.
  "$PWCLI" --session "$SESSION" open about:blank
  "$PWCLI" --session "$SESSION" state-load "$STATE_FILE"
  "$PWCLI" --session "$SESSION" goto "$URL"
  sleep 2

  local snapshot button_ref
  snapshot="$("$PWCLI" --session "$SESSION" snapshot)"
  button_ref="$(printf '%s\n' "$snapshot" | sed -nE 's/.*button "(Open Free|Ouvrir Gratuit)[^"]*" \[ref=([^]]+)\].*/\2/p' | head -n 1)"

  if [[ -z "$button_ref" ]]; then
    echo "Aucun booster gratuit disponible pour le moment."
    "$PWCLI" --session "$SESSION" state-save "$STATE_FILE"
    chmod 600 "$STATE_FILE"
    return 0
  fi

  if [[ "${1:-}" == "dry-run" ]]; then
    echo "Booster gratuit détecté (référence $button_ref), sans ouverture."
    return 0
  fi

  "$PWCLI" --session "$SESSION" click "$button_ref"
  sleep 3
  "$PWCLI" --session "$SESSION" state-save "$STATE_FILE"
  chmod 600 "$STATE_FILE"
  record_opening
  echo "Un booster gratuit a été ouvert."
}

case "${1:-}" in
  init)
    initialize
    ;;
  run|dry-run)
    open_free_booster "${1:-}"
    ;;
  stats)
    show_stats
    ;;
  *)
    usage
    exit 1
    ;;
esac
