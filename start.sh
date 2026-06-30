#!/usr/bin/env bash
#
# start.sh — Lance Ollama (IA locale), le backend et le frontend.
# Usage : ./start.sh   (depuis le dossier systeme/)
#
# Les services tournent en arrière-plan (logs et PID dans ./logs/).
# Pour les arrêter : ./stop.sh

set -euo pipefail

cd "$(dirname "$0")" || exit 1
mkdir -p logs

OLLAMA_TAGS="http://127.0.0.1:11434/api/tags"
BACK_HEALTH="http://127.0.0.1:4000/health"
FRONT_URL="http://127.0.0.1:5173"

# Renvoie 0 si l'URL répond (service en ligne).
is_up() { curl -fsS -m 2 -o /dev/null "$1" 2>/dev/null; }

read_pid() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 1
  tr -dc '0-9' < "$pid_file"
}

pid_is_running() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

start_background() {
  local label="$1"
  local slug="$2"
  shift 2

  local pid_file="logs/${slug}.pid"
  local log_file="logs/${slug}.log"
  local existing_pid
  existing_pid="$(read_pid "$pid_file" || true)"

  if pid_is_running "$existing_pid"; then
    echo "  ✓ $label déjà lancé (PID $existing_pid)"
    return 0
  fi

  rm -f "$pid_file"
  echo "  → Lancement : $label"
  nohup "$@" > "$log_file" 2>&1 &
  local pid="$!"
  printf "%s\n" "$pid" > "$pid_file"
  echo "    PID $pid, logs : $log_file"
}

echo "Démarrage de Système d'évolution…"
echo

# --- Dépendances & base (premier lancement uniquement) ---
[ -d server/node_modules ] || { echo "  → Installation des dépendances backend (1ère fois)…"; ( cd server && npm install ); }
[ -d client/node_modules ] || { echo "  → Installation des dépendances frontend (1ère fois)…"; ( cd client && npm install ); }
[ -f server/.env ] || { echo "  → Création de server/.env"; cp server/.env.example server/.env; }
[ -f client/.env ] || { echo "  → Création de client/.env"; cp client/.env.example client/.env; }
[ -f server/prisma/dev.db ] || { echo "  → Création de la base de données…"; ( cd server && npx prisma migrate deploy ); }

# --- 1) Ollama ---
if is_up "$OLLAMA_TAGS"; then
  echo "  ✓ Ollama déjà lancé"
elif command -v ollama >/dev/null 2>&1; then
  start_background "Ollama" "ollama" ollama serve
else
  echo "  ✗ Ollama n'est pas installé (https://ollama.com) — l'IA ne fonctionnera pas."
fi

# --- 2) Backend ---
if is_up "$BACK_HEALTH"; then
  echo "  ✓ Backend déjà lancé (port 4000)"
else
  start_background "backend" "backend" bash -c 'cd server && exec npm run dev'
fi

# --- 3) Frontend ---
if is_up "$FRONT_URL"; then
  echo "  ✓ Frontend déjà lancé (port 5173)"
else
  start_background "frontend" "frontend" bash -c 'cd client && exec npm run dev -- --host 127.0.0.1 --port 5173 --strictPort'
fi

# --- Attente que back + front répondent ---
printf "  Attente des services"
for _ in $(seq 1 40); do
  if is_up "$BACK_HEALTH" && is_up "$FRONT_URL"; then break; fi
  printf "."
  sleep 1
done
echo
echo

echo "État des services :"
is_up "$OLLAMA_TAGS"  && echo "  • Ollama   ✓  http://localhost:11434" || echo "  • Ollama   ✗  (voir logs/ollama.log)"
is_up "$BACK_HEALTH"  && echo "  • Backend  ✓  http://localhost:4000"  || echo "  • Backend  ✗  (voir logs/backend.log)"
is_up "$FRONT_URL"    && echo "  • Frontend ✓  http://localhost:5173"  || echo "  • Frontend ✗  (voir logs/frontend.log)"
echo
echo "👉 Ouvre http://localhost:5173"
echo "   Logs : tail -f logs/*.log     Arrêt : ./stop.sh"
