#!/bin/sh
set -e

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
