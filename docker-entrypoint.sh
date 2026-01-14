#!/bin/sh
set -e

# Fix permissions for mounted volumes if running as root
if [ "$(id -u)" = "0" ]; then
  # Fix ownership of data and config directories
  chown -R pondy:pondy /app/data 2>/dev/null || true
  chown -R pondy:pondy /app/config 2>/dev/null || true

  # Re-exec as pondy user
  exec su-exec pondy "$0" "$@"
fi

case "$1" in
  pondy)
    shift
    exec ./pondy "$@"
    ;;
  mock)
    shift
    exec ./pondy-mock "$@"
    ;;
  both)
    shift
    echo "Starting mock server on port ${MOCK_PORT:-9090}..."
    ./pondy-mock -port "${MOCK_PORT:-9090}" -max "${MOCK_MAX_CONNECTIONS:-20}" &
    sleep 1
    echo "Starting pondy server..."
    exec ./pondy "$@"
    ;;
  *)
    exec ./pondy "$@"
    ;;
esac
