#!/bin/bash
set -euo pipefail

HEALTH_URL="http://127.0.0.1:8080/health"
MAX_RETRIES=3
RETRY_DELAY=5

for i in $(seq 1 "$MAX_RETRIES"); do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "Health check passed"
    exit 0
  fi
  echo "Health check attempt $i/$MAX_RETRIES failed, retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done

echo "Health check failed after $MAX_RETRIES attempts"
exit 1
