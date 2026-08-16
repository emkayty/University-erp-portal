#!/usr/bin/env bash
set -Eeuo pipefail

: "${NODE_ENV:=staging}"
: "${PORT:=3001}"
: "${SHUTDOWN_TIMEOUT_MS:=10000}"

export NODE_ENV
export PORT
export API_PORT="${PORT}"
export SHUTDOWN_TIMEOUT_MS

# The API and worker launchers each derive DATABASE_URL and related runtime
# URLs from the Render-provided database variables.

api_pid=""
worker_pid=""
shutting_down="false"

shutdown() {
  if [[ "$shutting_down" == "true" ]]; then
    return
  fi
  shutting_down="true"
  echo "Render shutdown received; stopping API and worker gracefully"

  if [[ -n "$api_pid" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill -TERM "$api_pid" 2>/dev/null || true
  fi
  if [[ -n "$worker_pid" ]] && kill -0 "$worker_pid" 2>/dev/null; then
    kill -TERM "$worker_pid" 2>/dev/null || true
  fi

  sleep 2

  if [[ -n "$api_pid" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill -KILL "$api_pid" 2>/dev/null || true
  fi
  if [[ -n "$worker_pid" ]] && kill -0 "$worker_pid" 2>/dev/null; then
    kill -KILL "$worker_pid" 2>/dev/null || true
  fi
}

trap shutdown SIGTERM SIGINT

# Start the HTTP API. The API launcher sets PROCESS_ROLE=api and binds to
# Render's PORT through API_PORT.
PROCESS_ROLE=api /app/scripts/start-api.sh &
api_pid=$!

# Start BullMQ processors and schedules as a separate Node process. This is
# essential: the worker must retain PROCESS_ROLE=worker.
PROCESS_ROLE=worker /app/scripts/start-worker.sh &
worker_pid=$!

echo "UniPortal combined Render process started: api=${api_pid}, worker=${worker_pid}, port=${PORT}"

# If either process exits, terminate the other and let Render restart the
# service. This avoids silently running with only half of the application.
set +e
wait -n "$api_pid" "$worker_pid"
first_exit=$?
set -e

echo "API or worker exited with status ${first_exit}; stopping the sibling process"
shutdown
wait "$api_pid" 2>/dev/null || true
wait "$worker_pid" 2>/dev/null || true
exit "$first_exit"

