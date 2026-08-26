#!/bin/bash
# Double-click this file in Finder to start the draft command center in the
# background and open it in your browser. You can close the Terminal window
# that appears right away — the server keeps running until you double-click
# "Stop Draft.command", log out, or shut down.
#
# Bookmark http://localhost:4173 once this has run — that's the URL to load
# any time, as long as the server was started this session.

cd "$(dirname "$0")" || exit 1

PORT="${PORT:-4173}"
RUN_DIR=".run"
PID_FILE="${RUN_DIR}/e3draft.pid"
LOG_FILE="${RUN_DIR}/server.log"
mkdir -p "$RUN_DIR"

# Ask the OS what's actually listening on the port — more reliable than
# trusting a pid file, which can go stale (crash, manual start, etc).
RUNNING_PID="$(lsof -ti ":${PORT}" -sTCP:LISTEN 2>/dev/null | head -n1)"

if [ -n "$RUNNING_PID" ]; then
  echo "$RUNNING_PID" > "$PID_FILE"
  echo "Already running (pid ${RUNNING_PID}). Opening browser..."
  open "http://localhost:${PORT}"
  exit 0
fi

nohup node server.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
disown 2>/dev/null || true

( sleep 1.5 && open "http://localhost:${PORT}" ) &

echo "Started (pid $(cat "$PID_FILE")). Safe to close this window."
echo "Logs: ${LOG_FILE}"
exit 0
