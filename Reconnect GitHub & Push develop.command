#!/bin/bash
# Bell Data Intelligence — Reconnect GitHub & Push (develop → staging ONLY)
#
# Use this when "Push Changes.command" fails with an authentication error
# ("Invalid username or token" / "Authentication failed"). That means your
# GitHub Personal Access Token has expired or been revoked.
#
# This updates the token and pushes your CURRENT branch (develop) to GitHub,
# which deploys to STAGING. It deliberately does NOT touch main / production —
# you keep testing on staging first, then run "Open Production Release.command"
# when you're happy. (Unlike "Fix GitHub Auth & Push.command", which is for
# first-time setup and force-pushes main.)

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"
bar() { printf "==========================================================\n"; }

bar
echo "   Reconnect GitHub & Push  (develop → staging)"
bar
echo

if [ ! -d ".git" ] || ! git remote get-url origin >/dev/null 2>&1; then
  echo "ERROR: this folder isn't connected to GitHub yet."
  echo "Run '1. Connect to GitHub.command' first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# --- Work out owner / repo from the existing remote, stripping any old token --
CURRENT_REMOTE="$(git config --get remote.origin.url)"
NO_PROTO="${CURRENT_REMOTE#https://}"     # drop https://
NO_CREDS="${NO_PROTO#*@}"                 # drop user:token@  (if present)
REPO_PATH="${NO_CREDS#github.com/}"       # -> owner/repo.git
OWNER="${REPO_PATH%%/*}"

CUR_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "Repo:   github.com/${REPO_PATH%.git}"
echo "User:   ${OWNER}"
echo "Branch: ${CUR_BRANCH}  (this is what gets pushed → staging)"
echo

if [ "$CUR_BRANCH" != "develop" ]; then
  echo "Note: you're on '$CUR_BRANCH', not 'develop'. This will push '$CUR_BRANCH'."
  read -r -p "Continue? [Y/n] " GO
  case "$GO" in n|N|no|NO) echo "Aborted."; read -r -p "Press Enter to close..." _; exit 0 ;; esac
  echo
fi

# --- Clear any bad cached credentials so the dead token isn't reused ----------
echo "Clearing the old cached credentials..."
security delete-internet-password -s github.com 2>/dev/null || true
printf 'protocol=https\nhost=github.com\n\n' | git credential reject 2>/dev/null || true
echo "  done."
echo

# --- Walk through creating a fresh token --------------------------------------
echo "Your GitHub token has expired. Let's make a new one."
echo
echo "  On the GitHub page that opens:"
echo "    1. Note:        Bell Data Intelligence — local Mac"
echo "    2. Expiration:  90 days  (or 'No expiration')"
echo "    3. Scopes:      tick the  repo  checkbox"
echo "    4. Click 'Generate token', then COPY it (starts with ghp_)"
echo "       — it's shown only once."
echo
read -r -p "Press Enter to open the GitHub token page..." _
open "https://github.com/settings/tokens/new?description=Bell%20Data%20Intelligence%20%E2%80%94%20local%20Mac&scopes=repo" 2>/dev/null || true
echo

read -r -s -p "Paste your new token here (hidden), then press Enter: " GH_TOKEN
echo; echo
GH_TOKEN="$(printf '%s' "$GH_TOKEN" | tr -d '[:space:]')"
if [ -z "$GH_TOKEN" ]; then
  echo "No token pasted — re-run when you have it ready."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# --- Save token in the remote URL (local .git/config only, never pushed) ------
git remote set-url origin "https://${OWNER}:${GH_TOKEN}@github.com/${REPO_PATH}"

echo "Pushing ${CUR_BRANCH} to GitHub..."
echo
if git push origin "$CUR_BRANCH"; then
  echo
  bar
  echo "✓ Pushed ${CUR_BRANCH} successfully."
  bar
  echo
  echo "  Railway will rebuild + deploy STAGING in ~3 minutes:"
  echo "    https://app-staging.bell.qa     (portal)"
  echo "    https://admin-staging.bell.qa   (admin)"
  echo "    https://staging.bell.qa         (marketing)"
  echo
  echo "  Happy with staging? Then double-click:"
  echo "    'Open Production Release.command'   (ships develop → main → production)"
else
  echo
  echo "✗ Push still failed."
  echo "  Most likely the new token is missing the 'repo' scope — re-run this"
  echo "  and make sure the 'repo' checkbox is ticked when creating the token."
fi
echo
read -r -p "Press Enter to close..." _
