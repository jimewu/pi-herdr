#!/usr/bin/env bash
# Fetch the latest upstream copy of the herdr agent skill and replace SKILL.md.
#
# Source of truth: https://github.com/herdrdev/herdr/blob/main/skills/herdr/SKILL.md
# (Apache-2.0). This repo vendors that file verbatim so it can be diffed against
# upstream; the installed herdr binary is the authority for command syntax.
#
# Usage:
#   ./scripts/update-skill.sh [ref]     # default ref: main
#   ./scripts/update-skill.sh v0.8.0    # pin a tag/branch
#
# The script only replaces SKILL.md when the downloaded file has the expected
# herdr frontmatter, so a failed or wrong fetch never clobbers the vendored copy.
set -euo pipefail

cd "$(dirname "$0")/.."

REF="${1:-main}"
URL="https://raw.githubusercontent.com/herdrdev/herdr/${REF}/skills/herdr/SKILL.md"
TMP="$(mktemp)"

cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

echo "Fetching ${URL}"
curl -fsSL "$URL" -o "$TMP"

# Sanity check: must be a SKILL.md with the herdr frontmatter.
head -3 "$TMP" | grep -q '^---$' || { echo "error: fetched file has no frontmatter" >&2; exit 1; }
grep -q '^name: herdr$' "$TMP" || { echo "error: fetched file is not the herdr skill" >&2; exit 1; }

if diff -q SKILL.md "$TMP" >/dev/null; then
  echo "SKILL.md is already up to date at ${REF}."
else
  cp "$TMP" SKILL.md
  echo "Updated SKILL.md from ${REF}."
  echo "Review the diff, then commit:"
  echo "  git diff SKILL.md && git commit -am 'chore: sync herdr skill to ${REF}'"
fi
