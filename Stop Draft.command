#!/bin/bash
# Double-click this file in Finder to stop the draft command center that
# "Start Draft.command" started in the background.

cd "$(dirname "$0")" || exit 1

PORT="${PORT:-4173}"
PID_FILE=".run/e3draft.pid"

PID="$(lsof -ti ":${PORT}" -sTCP:LISTEN 2>/dev/null | head -n1)"
if [ -z "$PID" ] && [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
fi

if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped (pid ${PID})."
else
  echo "Not running."
fi

rm -f "$PID_FILE"
exit 0
