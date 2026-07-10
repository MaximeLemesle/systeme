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

# Utilise Node 22 local si disponible (Vite 8 exige Node 20.19+ ou 22.12+).
if [ -d "$HOME/.nvm/versions/node/v22.18.0/bin" ]; then
  export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"
fi

OLLAMA_TAGS="http://127.0.0.1:11434/api/tags"
BACK_HEALTH="http://127.0.0.1:4000/health"
FRONT_URL="http://127.0.0.1:5173"

# Renvoie 0 si l'URL répond (service en ligne).
is_up() { curl -fsS -m 2 -o /dev/null "$1" 2>/dev/null; }

show_log_tail() {
  local log_file="$1"
  [ -f "$log_file" ] || return 0
  echo "      Dernières lignes de $log_file :"
  tail -n 30 "$log_file" | sed 's/^/      /'
}

install_deps() {
  local dir="$1"
  local label="$2"
  echo "  → Installation des dépendances $label…"
  ( cd "$dir" && npm install --include=dev )
}

server_deps_ok() {
  [ -d server/node_modules ] &&
    [ -d server/node_modules/express ] &&
    [ -d server/node_modules/@prisma/client ]
}

client_deps_ok() {
  [ -d client/node_modules ] &&
    [ -x client/node_modules/.bin/vite ] &&
    [ -f client/node_modules/vite/bin/vite.js ] &&
    [ -f client/node_modules/vite/dist/node/cli.js ] &&
    [ -d client/node_modules/@vitejs/plugin-react ] &&
    [ -d client/node_modules/@tailwindcss/vite ]
}

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
  nohup "$@" </dev/null > "$log_file" 2>&1 &
  local pid="$!"
  printf "%s\n" "$pid" > "$pid_file"
  disown "$pid" 2>/dev/null || true
  echo "    PID $pid, logs : $log_file"

  sleep 1
  if ! pid_is_running "$pid"; then
    echo "    ✗ $label s'est arrêté immédiatement (voir $log_file)"
    show_log_tail "$log_file"
    return 1
  fi
}

echo "Démarrage de Running Club…"
echo

# --- Dépendances & base (premier lancement uniquement) ---
if ! server_deps_ok; then
  echo "  → Dépendances backend absentes ou incomplètes."
  rm -rf server/node_modules
  install_deps server "backend"
fi

if ! client_deps_ok; then
  echo "  → Dépendances frontend absentes ou incomplètes."
  echo "    Réinstallation propre de client/node_modules pour réparer Vite."
  rm -rf client/node_modules
  install_deps client "frontend"
fi

[ -f server/.env ] || { echo "  → Création de server/.env"; cp server/.env.example server/.env; }
[ -f client/.env ] || { echo "  → Création de client/.env"; cp client/.env.example client/.env; }
[ -f server/prisma/dev.db ] || { echo "  → Création de la base de données…"; ( cd server && npx prisma migrate deploy ); }

# --- 1) Ollama ---
if is_up "$OLLAMA_TAGS"; then
  echo "  ✓ Ollama déjà lancé"
elif command -v ollama >/dev/null 2>&1; then
  start_background "Ollama" "ollama" ollama serve || echo "  ! Ollama n'a pas pu être lancé automatiquement. L'app continue sans IA locale."
else
  echo "  ✗ Ollama n'est pas installé (https://ollama.com) — l'IA ne fonctionnera pas."
fi

# --- 2) Backend ---
if is_up "$BACK_HEALTH"; then
  echo "  ✓ Backend déjà lancé (port 4000)"
else
  start_background "backend" "backend" bash -c 'cd server && exec node src/index.js'
fi

# --- 3) Frontend ---
if is_up "$FRONT_URL"; then
  echo "  ✓ Frontend déjà lancé (port 5173)"
else
  start_background "frontend" "frontend" bash -c 'cd client && exec ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort'
fi

# --- Attente que back + front répondent ---
# Au-delà de 30s, quelque chose ne va pas : on coupe et on affiche un diagnostic.
WAIT_SECONDS=30
printf "  Attente des services (jusqu'à %ss)" "$WAIT_SECONDS"
for i in $(seq 1 "$WAIT_SECONDS"); do
  if is_up "$BACK_HEALTH" && is_up "$FRONT_URL"; then break; fi
  printf "."
  sleep 1
done
echo
echo

echo "État des services :"
ollama_ok=0
backend_ok=0
frontend_ok=0

is_up "$OLLAMA_TAGS" && ollama_ok=1
is_up "$BACK_HEALTH" && backend_ok=1
is_up "$FRONT_URL" && frontend_ok=1

[ "$ollama_ok" -eq 1 ]  && echo "  • Ollama   ✓  http://localhost:11434" || echo "  • Ollama   ✗  (voir logs/ollama.log)"
[ "$backend_ok" -eq 1 ] && echo "  • Backend  ✓  http://localhost:4000"  || echo "  • Backend  ✗  (voir logs/backend.log)"
[ "$frontend_ok" -eq 1 ] && echo "  • Frontend ✓  http://localhost:5173"  || echo "  • Frontend ✗  (voir logs/frontend.log)"
echo

if [ "$backend_ok" -ne 1 ] || [ "$frontend_ok" -ne 1 ]; then
  echo "✗ Échec du démarrage : backend et/ou frontend ne répondent pas après ${WAIT_SECONDS}s."
  # Logs vides + process toujours vivant = pas un crash, juste très lent (RAM/swap saturés).
  backend_pid="$(read_pid logs/backend.pid || true)"
  frontend_pid="$(read_pid logs/frontend.pid || true)"
  if { [ "$backend_ok" -ne 1 ] && pid_is_running "$backend_pid" && [ ! -s logs/backend.log ]; } ||
     { [ "$frontend_ok" -ne 1 ] && pid_is_running "$frontend_pid" && [ ! -s logs/frontend.log ]; }; then
    echo
    echo "Le(s) process tourne(nt) toujours mais n'a/ont rien écrit : ça ressemble à une machine"
    echo "sous forte pression mémoire (swap élevé) plutôt qu'à un plantage. Vérifie :"
    echo "  sysctl vm.swapusage"
    echo "Si le swap est presque plein, ferme des applications (ou redémarre le Mac) puis relance ./start.sh"
  else
    echo "Consulte les logs :"
    [ "$backend_ok" -ne 1 ] && echo "  tail -n 80 logs/backend.log"
    [ "$frontend_ok" -ne 1 ] && echo "  tail -n 80 logs/frontend.log"
  fi
  echo
  echo "Arrêt automatique des services lancés…"
  ./stop.sh || true
  exit 1
fi

if [ "$ollama_ok" -ne 1 ]; then
  echo "IA locale indisponible : l'app démarre, mais les fonctions IA échoueront tant qu'Ollama ne tourne pas."
fi

echo "👉 Running Club est disponible sur http://127.0.0.1:5173"
echo "   Si ton navigateur préfère localhost, http://localhost:5173 doit aussi fonctionner."
echo "   Logs : tail -f logs/*.log     Arrêt : ./stop.sh"
