#!/bin/bash
# Bell — REDEPLOY all services (fixes a Railway build that failed for no reason).
#
# WHEN TO USE THIS: Railway shows a red/failed build, or a service is stuck on an older
# version. Railway's builder occasionally fails to start — the build dies instantly with NO
# log output at all, even though the code is fine (it happened on 2026-07-16: the admin
# service failed while the other three built the identical Dockerfile from the same commit).
# There is nothing to fix in the code; it just needs building again.
#
# WHAT IT DOES: pushes an empty "retrigger" commit to GitHub, which makes Railway rebuild
# and redeploy every service (staging + production). It changes NO code and is always safe
# to run. Allow ~3 minutes, then it checks each service and prints what version it's on.
#
# If a service still shows an old version after this, tell Claude.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

bar() { printf "==========================================================\n"; }
bar; echo "  Bell — Redeploy all services"; bar; echo

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "$BRANCH" != "develop" ]; then
  echo "ERROR: you are on branch '$BRANCH', expected 'develop'. Stopping so nothing odd is pushed."
  read -r -p "Press Enter to close..." _; exit 1
fi

echo "→ Pushing a retrigger commit (no code changes)…"
git commit -q --allow-empty -m "chore: retrigger Railway build (manual redeploy)" || true
git fetch origin main -q
git merge origin/main --no-edit -q
git push origin develop -q
git push origin develop:main 2>&1 | tail -1
SHA="$(git rev-parse --short HEAD)"
echo "→ Pushed $SHA. Railway is rebuilding now."
echo

echo "→ Waiting ~3 minutes for the rebuild, then checking every service…"
for i in $(seq 1 8); do
  sleep 30
  ALL_OK=1
  printf "\n  check %d:\n" "$i"
  for u in "https://app.bell.qa" "https://admin.bell.qa" "https://app-staging.bell.qa" "https://admin-staging.bell.qa"; do
    B="$(curl -s --max-time 15 "$u/api/health" 2>/dev/null | grep -oE '"build":"[^"]*"' | head -1 | cut -d'"' -f4)"
    printf "    %-34s %s\n" "$u" "${B:-(no answer yet)}"
    [ "$B" = "$SHA" ] || ALL_OK=0
  done
  if [ "$ALL_OK" = "1" ]; then echo; echo "  ✅ All services are on $SHA — the failed build is cleared."; break; fi
done

echo
echo "If any service is still on an older version above, Railway needs another nudge —"
echo "run this again, or tell Claude."
echo
read -r -p "Press Enter to close this window..." _
