#!/usr/bin/env bash
# Task 102: prevent regressions to native browser pop-ups inside the React app.
#
# We standardize on the themed AlertDialog from `@/components/ui/alert-dialog`
# for blocking confirmations and on `useToast` for non-blocking alerts. The
# native window.confirm / window.alert / window.prompt dialogs cannot be
# styled, fail accessibility expectations against the dark theme, and are
# hard to test, so we forbid them in `client/src` outright.
#
# This script greps for direct uses of those globals and exits non-zero if
# any are found. Run via `npm run lint:dialogs` or wire into CI / a pre-
# commit hook.
#
# To intentionally allow a usage (extremely rare — e.g. a debug-only tool),
# add `// allow-native-dialog` on the same line as the call.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${ROOT_DIR}/client/src"

if [ ! -d "${TARGET_DIR}" ]; then
  echo "check-no-native-dialogs: target directory not found: ${TARGET_DIR}" >&2
  exit 2
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "check-no-native-dialogs: ripgrep (rg) is required" >&2
  exit 2
fi

# Match the native dialog globals anywhere in client/src. Two patterns:
#   1) `window.confirm(`, `window.alert(`, `window.prompt(` — explicitly
#      qualified on the `window` global.
#   2) Bare unqualified `confirm(`, `alert(`, `prompt(` — would also call
#      the global. We use a negative look-behind (PCRE2) so we don't
#      flag legitimate methods/identifiers like `obj.confirm(...)`,
#      `confirmDeleteSet(...)`, `myAlert(...)`. We also require no
#      whitespace before `(` so JSX/text like `prompt (sent to model)`
#      isn't incorrectly flagged.
# Lines tagged with `allow-native-dialog` are intentionally skipped.
PATTERN_QUALIFIED='\bwindow\.(confirm|alert|prompt)\s*\('
PATTERN_BARE='(?<![A-Za-z0-9_.$])(confirm|alert|prompt)\('

MATCHES_QUALIFIED=$(rg -n --no-heading --color=never \
  --glob '*.ts' --glob '*.tsx' --glob '*.js' --glob '*.jsx' \
  "${PATTERN_QUALIFIED}" "${TARGET_DIR}" \
  | rg -v 'allow-native-dialog' || true)

MATCHES_BARE=$(rg -n --no-heading --color=never -P \
  --glob '*.ts' --glob '*.tsx' --glob '*.js' --glob '*.jsx' \
  "${PATTERN_BARE}" "${TARGET_DIR}" \
  | rg -v 'allow-native-dialog' || true)

MATCHES=""
if [ -n "${MATCHES_QUALIFIED}" ]; then
  MATCHES="${MATCHES_QUALIFIED}"
fi
if [ -n "${MATCHES_BARE}" ]; then
  if [ -n "${MATCHES}" ]; then
    MATCHES="${MATCHES}"$'\n'"${MATCHES_BARE}"
  else
    MATCHES="${MATCHES_BARE}"
  fi
fi

if [ -n "${MATCHES}" ]; then
  echo "Native browser dialogs are not allowed in client/src." >&2
  echo "Use AlertDialog from '@/components/ui/alert-dialog' for confirmations" >&2
  echo "and useToast for non-blocking alerts. Offending lines:" >&2
  echo "" >&2
  echo "${MATCHES}" >&2
  exit 1
fi

echo "check-no-native-dialogs: OK (no window.confirm/alert/prompt in client/src)"
