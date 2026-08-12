#!/usr/bin/env bash
# Install the pi-herdr strategy layer for pi:
#   - symlink this repo into ~/.agents/skills/herdr (skill discovery)
#   - symlink agents/*.md into ~/.pi/agent/agents/ (official pi subagent profiles)
#
# The execution layer (herdr_layout / herdr_pane / herdr_agent tools) comes from
# the third-party pi-herdr extension and is NOT installed by this script.
# See README.md for that step.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"

SKILL_DEST="${HOME}/.agents/skills/herdr"
AGENTS_DIR="${HOME}/.pi/agent/agents"

echo "Installing from ${REPO_DIR}"

# 1. Skill symlink
mkdir -p "$(dirname "$SKILL_DEST")"
if [ -L "$SKILL_DEST" ] && [ "$(readlink "$SKILL_DEST")" = "$REPO_DIR" ]; then
  echo "skill already linked: ${SKILL_DEST}"
else
  ln -sfn "$REPO_DIR" "$SKILL_DEST"
  echo "linked skill -> ${SKILL_DEST}"
fi

# 2. Subagent profiles
if ls agents/*.md >/dev/null 2>&1; then
  mkdir -p "$AGENTS_DIR"
  for f in agents/*.md; do
    ln -sf "$REPO_DIR/$f" "$AGENTS_DIR/$(basename "$f")"
  done
  echo "linked profiles -> ${AGENTS_DIR}"
else
  echo "no profiles found in agents/; skipped"
fi

echo
echo "Done. Remember to install the pi-herdr extension (herdr_* tools) separately:"
echo "  ln -sfn /path/to/pi-herdr/packages/pi-herdr ~/.pi/agent/extensions/pi-herdr"
echo "  # or: pi install npm:@ogulcancelik/pi-herdr"
