#!/usr/bin/env bash
#
# stop.sh - Arrete Ollama, le backend et le frontend.
# Usage : ./stop.sh   (depuis le dossier systeme/)

set -u

cd "$(dirname "$0")" || exit 1

LOG_DIR="logs"
OLLAMA_TAGS="http://127.0.0.1:11434/api/tags"
BACK_HEALTH="http://127.0.0.1:4000/health"
FRONT_URL="http://127.0.0.1:5173"

is_up() {
  curl -fsS -m 2 -o /dev/null "$1" 2>/dev/null
}

read_pid() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 1
  tr -dc '0-9' < "$pid_file"
}

pid_is_running() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

children_of() {
  command -v pgrep >/dev/null 2>&1 || return 0
  pgrep -P "$1" 2>/dev/null || true
}

collect_tree() {
  local pid="$1"
  pid_is_running "$pid" || return 0

  echo "$pid"

  local child
  for child in $(children_of "$pid"); do
    collect_tree "$child"
  done
}

kill_tree() {
  local pid="$1"
  local pids
  pids="$(collect_tree "$pid" | awk '!seen[$0]++')"
  [ -n "$pids" ] || return 0

  kill $pids 2>/dev/null || true

  local candidate
  local alive
  for _ in $(seq 1 25); do
    alive=""
    for candidate in $pids; do
      if pid_is_running "$candidate"; then
        alive="$alive $candidate"
      fi
    done

    [ -z "$alive" ] && return 0
    sleep 0.2
  done

  kill -KILL $alive 2>/dev/null || true
}

stop_from_pid_file() {
  local label="$1"
  local slug="$2"
  local pid_file="$LOG_DIR/${slug}.pid"
  local pid

  pid="$(read_pid "$pid_file" || true)"
  if ! pid_is_running "$pid"; then
    rm -f "$pid_file"
    return 1
  fi

  echo "  - $label : arret du PID $pid"
  kill_tree "$pid"
  rm -f "$pid_file"
  return 0
}

stop_by_port_if_running() {
  local label="$1"
  local port="$2"
  local check_url="$3"

  if ! is_up "$check_url"; then
    echo "  - $label : deja arrete"
    return 0
  fi

  if ! command -v lsof >/dev/null 2>&1; then
    echo "  ! $label repond encore, mais lsof est indisponible"
    return 1
  fi

  local pids
  pids="$(lsof -ti "tcp:${port}" 2>/dev/null | sort -u || true)"
  if [ -z "$pids" ]; then
    echo "  ! $label repond encore, mais aucun PID n'a ete trouve sur le port $port"
    return 1
  fi

  echo "  - $label : arret via le port $port"
  local pid
  for pid in $pids; do
    kill_tree "$pid"
  done
}

stop_ollama_fallback() {
  if ! is_up "$OLLAMA_TAGS"; then
    echo "  - Ollama : deja arrete"
    return 0
  fi

  if command -v pkill >/dev/null 2>&1 && pkill -f "ollama serve" 2>/dev/null; then
    sleep 1
  fi

  if is_up "$OLLAMA_TAGS"; then
    echo "  ! Ollama repond encore. Arrete-le depuis l'app Ollama si elle le gere."
    return 1
  fi

  echo "  - Ollama : arrete"
}

echo "Arret des services..."
echo

stop_from_pid_file "Ollama" "ollama" || stop_ollama_fallback
stop_from_pid_file "Backend" "backend" || stop_by_port_if_running "Backend" 4000 "$BACK_HEALTH"
stop_from_pid_file "Frontend" "frontend" || stop_by_port_if_running "Frontend" 5173 "$FRONT_URL"

echo
echo "Termine."
