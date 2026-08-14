#!/bin/bash
# Double-click this file in Finder to start the draft command center and open it
# in your browser. Closing the Terminal window that appears stops the app.

cd "$(dirname "$0")" || exit 1

# Give the server a moment to bind the port, then open the page.
( sleep 1.5 && open "http://localhost:${PORT:-4173}" ) &

exec node server.js
