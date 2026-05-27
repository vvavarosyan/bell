#!/bin/bash
# Bell Data Intelligence — Open Production Release
#
# Double-click when you've tested your changes on staging and want to ship
# them to production. This opens GitHub in your browser, pre-filled to create
# a Pull Request from `develop` → `main`.
#
# Steps for you on the GitHub page:
#   1. Review the diff (what's about to go to production)
#   2. Add a description if you want (optional)
#   3. Click 'Create pull request'
#   4. Click 'Merge pull request' → 'Confirm merge'
#
# Once merged, Railway auto-deploys to production in ~3 minutes:
#   • https://bell.qa            (marketing)
#   • https://app.bell.qa        (portal)
#   • https://admin.bell.qa      (admin)
#
# If something looks wrong, just close the GitHub page. Nothing happens until
# you click 'Merge'.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Open Production Release"
bar
echo

# -----------------------------------------------------------------------------
# 1. Get the GitHub remote URL → convert to web URL
# -----------------------------------------------------------------------------
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "ERROR: no GitHub remote configured."
  echo "Run '1. Connect to GitHub.command' first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

REMOTE_URL="$(git config --get remote.origin.url)"

# Normalize SSH form (git@github.com:user/repo.git) → web URL
case "$REMOTE_URL" in
  git@github.com:*)
    REPO_PATH="${REMOTE_URL#git@github.com:}"
    REPO_PATH="${REPO_PATH%.git}"
    WEB_URL="https://github.com/$REPO_PATH" ;;
  https://github.com/*)
    WEB_URL="${REMOTE_URL%.git}" ;;
  *)
    echo "ERROR: don't recognize remote URL format: $REMOTE_URL"
    read -r -p "Press Enter to close..." _
    exit 1 ;;
esac

# -----------------------------------------------------------------------------
# 2. Confirm develop has commits not in main
# -----------------------------------------------------------------------------
echo "Fetching latest from GitHub to see what's ahead..."
git fetch origin main develop 2>/dev/null || true

COMMITS_AHEAD="$(git rev-list --count origin/main..origin/develop 2>/dev/null || echo 0)"

if [ "$COMMITS_AHEAD" = "0" ]; then
  echo
  echo "Nothing to release. The develop branch has no new commits ahead of main."
  echo "Make some changes on develop first, then push them with 'Push Changes.command'."
  echo
  read -r -p "Press Enter to close..." _
  exit 0
fi

echo
echo "  $COMMITS_AHEAD commit(s) on develop are ready to ship to production:"
echo
git log --oneline origin/main..origin/develop | head -10 | sed 's/^/    /'
if [ "$COMMITS_AHEAD" -gt 10 ]; then
  echo "    ... and $(( COMMITS_AHEAD - 10 )) more"
fi
echo

# -----------------------------------------------------------------------------
# 3. Build the PR-creation URL
# -----------------------------------------------------------------------------
# GitHub's "compare" URL with quick_pull=1 takes you straight to the PR
# creation form, pre-filled with base=main, compare=develop.
PR_URL="$WEB_URL/compare/main...develop?quick_pull=1&title=Release%20to%20production%20%E2%80%94%20$(date '+%Y-%m-%d')"

echo "Opening GitHub PR creation page in your browser..."
echo
echo "  $PR_URL"
echo
echo "  On the GitHub page:"
echo "  1. Review the diff at the bottom"
echo "  2. Click 'Create pull request'"
echo "  3. Then click 'Merge pull request' → 'Confirm merge'"
echo
echo "  Railway will auto-deploy to production within ~3 minutes after merge."
echo

# Open in default browser (macOS)
open "$PR_URL" || true

echo
read -r -p "Press Enter to close..." _
