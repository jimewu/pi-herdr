#!/usr/bin/env bash
# Fetch the latest upstream copy of the herdr agent skill and replace SKILL.md.
#
# Source of truth: https://github.com/herdrdev/herdr/blob/master/skills/herdr/SKILL.md
# (Apache-2.0). This repo vendors that file verbatim so it can be diffed against
# upstream; the installed herdr binary is the authority for command syntax.
#
# Usage:
#   ./scripts/update-skill.sh [--dry-run] [ref]   # default ref: master
#   ./scripts/update-skill.sh v0.8.0              # pin a tag/branch
#   ./scripts/update-skill.sh --dry-run v0.8.0    # download + verify only, no write
#
# The script only replaces SKILL.md when the downloaded file passes the sanity
# checks (frontmatter, name, line count, HERDR_ENV), so a failed or wrong fetch
# never clobbers the vendored copy.
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=0
REF="master"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -*) echo "error: unknown option: $arg" >&2; exit 2 ;;
    *) REF="$arg" ;;
  esac
done

URL="https://raw.githubusercontent.com/herdrdev/herdr/${REF}/skills/herdr/SKILL.md"
TMP="$(mktemp)"

cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

echo "Fetching ${URL}"
curl -fsSL "$URL" -o "$TMP"

# Sanity checks: must be a SKILL.md with the herdr frontmatter, a plausible
# line count, and the HERDR_ENV gate the skill relies on.
head -3 "$TMP" | grep -q '^---$' || { echo "error: fetched file has no frontmatter" >&2; exit 1; }
grep -q '^name: herdr$' "$TMP" || { echo "error: fetched file is not the herdr skill" >&2; exit 1; }
LINES="$(wc -l < "$TMP")"
if [ "$LINES" -lt 100 ]; then
  echo "error: fetched file looks too short (${LINES} lines < 100)" >&2
  exit 1
fi
grep -q 'HERDR_ENV' "$TMP" || { echo "error: fetched file is missing HERDR_ENV" >&2; exit 1; }

if diff -q SKILL.md "$TMP" >/dev/null; then
  echo "SKILL.md is already up to date at ${REF}."
elif [ "$DRY_RUN" -eq 1 ]; then
  echo "(dry run) SKILL.md would be updated from ${REF}; not written."
else
  cp "$TMP" SKILL.md
  echo "Updated SKILL.md from ${REF}."
  echo "Review the diff, then commit:"
  echo "  git diff SKILL.md && git commit -am 'chore: sync herdr skill to ${REF}'"
fi
