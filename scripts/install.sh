#!/usr/bin/env bash
# Optional: symlink this repo's subagent profiles into pi's official subagent
# location so the built-in subagent tool can discover them.
#
# This is NOT required for the extension itself — `pi -e .` from the repo
# directory already loads the herdr_* tools and the herdr skill. This script
# only installs the agents/*.md profiles for the official pi subagent extension.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"

AGENTS_DIR="${HOME}/.pi/agent/agents"

echo "Installing profiles from ${REPO_DIR}/agents"

if ls agents/*.md >/dev/null 2>&1; then
  mkdir -p "$AGENTS_DIR"
  for f in agents/*.md; do
    ln -sf "$REPO_DIR/$f" "$AGENTS_DIR/$(basename "$f")"
  done
  echo "linked profiles -> ${AGENTS_DIR}"
else
  echo "no profiles found in agents/; skipped"
fi
