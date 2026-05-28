#!/usr/bin/env bash
# PreToolUse guard for Bash commands. Reads the proposed command from stdin (JSON)
# or $CLAUDE_TOOL_INPUT and blocks obvious foot-guns. Exit 1 + message = block.
set -euo pipefail

cmd="${CLAUDE_TOOL_INPUT:-}"
if [ -z "$cmd" ] && [ ! -t 0 ]; then
  cmd="$(cat || true)"
fi

block() {
  echo "BLOCKED by block-dangerous.sh: $1" >&2
  exit 1
}

case "$cmd" in
  *"rm -rf /"*)              block "recursive delete of root" ;;
  *"rm -rf ~"*)             block "recursive delete of home" ;;
  *"git push --force"*main*) block "force push to main" ;;
  *"docker system prune"*)  block "wide docker prune" ;;
  *"--no-verify"*)          block "bypassing pre-commit hooks" ;;
  *sudo*)                   block "sudo not allowed" ;;
esac

# Discourage reading secrets
case "$cmd" in
  *"cat .env"*|*"cat "*"/.env"*) block "reading .env secrets" ;;
esac

exit 0
