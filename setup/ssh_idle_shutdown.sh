#!/bin/bash

STATE_FILE="/tmp/ssh_idle_count"

if [ ! -f "$STATE_FILE" ]; then
    echo 0 >"$STATE_FILE"
fi

IDLE_COUNT=$(cat "$STATE_FILE")

SSH_CONNECTED=$(netstat -tn | grep ':22' | grep -c 'ESTABLISHED')

if [ "$SSH_CONNECTED" -eq 0 ]; then
    IDLE_COUNT=$((IDLE_COUNT + 1))
    echo "$IDLE_COUNT" >"$STATE_FILE"

    if [ "$IDLE_COUNT" -ge 3 ]; then
        echo "No SSH connection. Shutting down..."
        shutdown -h now
    fi
else
    echo 0 >"$STATE_FILE"
fi
