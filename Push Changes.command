#!/bin/bash
# Bell Data Intelligence — Push Changes (to staging)
#
# Double-click whenever you want to push your latest code changes to GitHub.
# This pushes to the `develop` branch, which auto-deploys to staging on
# Railway:
#   • staging.bell.qa       (marketing)
#   • app-staging.bell.qa   (portal)
#   • admin-staging.bell.qa (admin)
#
# Allow ~3 minutes after push for Railway to rebuild and deploy.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Push Changes to Staging"
bar
echo

# -----------------------------------------------------------------------------
# 1. Make sure we're a git repo connected to GitHub
# -----------------------------------------------------------------------------
if [ ! -d ".git" ]; then
  echo "ERROR: this folder is not connected to GitHub yet."
  echo "Run '1. Connect to GitHub.command' first."
  read -r -p "Press Enter to close..." _
  exit 1
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "ERROR: no GitHub remote configured."
  echo "Run '1. Connect to GitHub.command' first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. Make sure we're on develop (or offer to switch)
# -----------------------------------------------------------------------------
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "develop" ]; then
  echo "You're on branch '$CURRENT_BRANCH', not 'develop'."
  echo
  read -r -p "Switch to develop and push from there? [Y/n] " SWITCH
  case "$SWITCH" in
    n|N|no|NO)
      echo "Keeping current branch. Aborting push."
      read -r -p "Press Enter to close..." _
      exit 0 ;;
    *)
      # Make sure local develop is up to date with remote before switching
      git fetch origin develop 2>/dev/null || true
      if git show-ref --verify --quiet refs/heads/develop; then
        git checkout develop
      else
        git checkout -b develop origin/develop 2>/dev/null || git checkout -b develop
      fi
      ;;
  esac
  echo
fi

# -----------------------------------------------------------------------------
# 3. Pull latest from GitHub first — avoids "rejected: remote contains work
#    you don't have" errors after GitHub-side merges or other-machine pushes.
# -----------------------------------------------------------------------------
echo "Pulling latest from GitHub..."
if ! git pull --no-rebase --no-edit origin develop; then
  echo
  echo "Pull failed — there are merge conflicts between local and remote."
  echo "Open the conflicted file(s) in your editor, resolve the <<<<<< / >>>>>> markers,"
  echo "save, then run this script again. Or paste the conflict to Claude to help."
  read -r -p "Press Enter to close..." _
  exit 1
fi
echo

# -----------------------------------------------------------------------------
# 4. Show what's about to be staged
# -----------------------------------------------------------------------------
echo "Changes since last commit:"
echo
git status --short
echo

# Anything to commit?
if [ -z "$(git status --porcelain)" ]; then
  # Special case: nothing to commit, but there might be unpushed commits
  # (e.g. you committed earlier and the push was rejected for fetch-first
  # reasons; now that we've pulled, just push what's already committed).
  AHEAD="$(git rev-list --count origin/develop..develop 2>/dev/null || echo 0)"
  if [ "$AHEAD" -gt 0 ]; then
    echo "No new file changes, but $AHEAD commit(s) waiting to push..."
    if git push origin develop; then
      bar
      echo "✓ Pushed $AHEAD commit(s) successfully."
      bar
    else
      echo "Push failed."
    fi
    read -r -p "Press Enter to close..." _
    exit 0
  fi
  echo "No changes to push. Nothing to do."
  read -r -p "Press Enter to close..." _
  exit 0
fi

# -----------------------------------------------------------------------------
# 4. Ask for a commit message
# -----------------------------------------------------------------------------
echo "Enter a short commit message describing what changed."
echo "(Press Enter alone to use a default message with today's date.)"
echo
read -r -p "Commit message: " COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="Update — $(date '+%Y-%m-%d %H:%M')"
fi

# -----------------------------------------------------------------------------
# 5. Stage + commit + push
# -----------------------------------------------------------------------------
echo
echo "Staging all changes (respecting .gitignore)..."
git add -A

echo "Committing..."
git commit -m "$COMMIT_MSG"

echo
echo "Pushing to GitHub (branch: develop)..."
if git push origin develop; then
  echo
  bar
  echo "✓ Pushed successfully."
  bar
  echo
  echo "  Railway will rebuild and deploy to staging in ~3 minutes."
  echo
  echo "  Watch the deployment:"
  echo "    https://railway.com (your project → staging environment → Deployments)"
  echo
  echo "  Test on staging:"
  echo "    https://staging.bell.qa         (marketing)"
  echo "    https://app-staging.bell.qa     (portal)"
  echo "    https://admin-staging.bell.qa   (admin)"
  echo
  echo "  Happy with what you see? Double-click"
  echo "    'Open Production Release.command'"
  echo "  to ship develop → main → production."
else
  echo
  echo "Push failed. Check your GitHub credentials / network."
  echo "If you've recently set up GitHub auth, you may need a Personal Access"
  echo "Token. See https://docs.github.com/en/authentication"
fi
echo
read -r -p "Press Enter to close..." _
