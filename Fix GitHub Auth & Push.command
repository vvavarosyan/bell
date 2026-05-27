#!/bin/bash
# Bell Data Intelligence — Fix GitHub Auth & Push
#
# Run this if the first push failed because of wrong password / auth issues.
# It will:
#   1. Clear any cached GitHub credentials from macOS Keychain
#   2. Walk you through creating a Personal Access Token (PAT) on GitHub
#   3. Save the PAT as your auth method (in your local .git/config)
#   4. Push both main and develop branches to GitHub
#
# GitHub no longer accepts account passwords for git push — only Personal
# Access Tokens (PATs) or SSH keys. We use PATs because they're simplest.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Fix GitHub Auth & Push"
bar
echo

# -----------------------------------------------------------------------------
# 1. Sanity checks
# -----------------------------------------------------------------------------
if [ ! -d ".git" ]; then
  echo "ERROR: this folder isn't a git repository."
  echo "Run '1. Connect to GitHub.command' first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

CURRENT_REMOTE="$(git config --get remote.origin.url || true)"
if [ -z "$CURRENT_REMOTE" ]; then
  echo "ERROR: no GitHub remote configured yet."
  echo "Run '1. Connect to GitHub.command' first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Strip any embedded credentials from current remote so we can show it cleanly
DISPLAY_REMOTE="$(echo "$CURRENT_REMOTE" | sed -E 's|https://[^@]+@github.com|https://github.com|')"
echo "Current remote: $DISPLAY_REMOTE"
echo

# Auto-detect username from the URL: https://github.com/USERNAME/repo.git
GH_USERNAME="$(echo "$CURRENT_REMOTE" | sed -E 's|^https://(.*@)?github.com/([^/]+)/.*|\2|')"
if [ -z "$GH_USERNAME" ] || [ "$GH_USERNAME" = "$CURRENT_REMOTE" ]; then
  echo "Couldn't auto-detect GitHub username. Please enter it."
  read -r -p "GitHub username: " GH_USERNAME
fi
echo "GitHub username: $GH_USERNAME"
echo

# -----------------------------------------------------------------------------
# 2. Clear any cached credentials so the wrong password isn't reused
# -----------------------------------------------------------------------------
echo "Step 1 of 4 — clearing any cached GitHub credentials..."

# Remove from macOS Keychain
security delete-internet-password -s github.com 2>/dev/null || true
security delete-internet-password -s api.github.com 2>/dev/null || true

# Tell git's credential helper to reject any stored creds for github.com
{
  printf 'protocol=https\nhost=github.com\n\n'
} | git credential reject 2>/dev/null || true

echo "  ✓ Done."
echo

# -----------------------------------------------------------------------------
# 3. Walk through Personal Access Token creation
# -----------------------------------------------------------------------------
echo "Step 2 of 4 — create a Personal Access Token (PAT) on GitHub"
echo
echo "  GitHub no longer accepts your account password for git push."
echo "  You need a Personal Access Token (PAT) instead. We'll create one now."
echo
echo "  On the page that's about to open in your browser:"
echo
echo "    1. 'Note' field        — type:   Bell Data Intelligence — local Mac"
echo "    2. 'Expiration'        — choose: 1 year  (or 'No expiration')"
echo "    3. 'Select scopes'     — check the box for:  repo"
echo "                              (this gives full control of private repos)"
echo "    4. Scroll down → click  Generate token"
echo "    5. COPY THE TOKEN — it starts with 'ghp_' and is shown ONCE"
echo "       (you can't see it again after leaving the page)"
echo
read -r -p "Press Enter to open the GitHub token page..." _
open "https://github.com/settings/tokens/new?description=Bell%20Data%20Intelligence%20%E2%80%94%20local%20Mac&scopes=repo"
echo

# -----------------------------------------------------------------------------
# 4. Capture the PAT
# -----------------------------------------------------------------------------
echo "Step 3 of 4 — paste the token here"
echo
echo "  After creating it on GitHub and copying it, paste it below."
echo "  (Nothing will appear as you paste — that's normal, it's hidden for"
echo "   security. Press Enter when done.)"
echo
read -r -s -p "Paste your token: " GH_TOKEN
echo
echo

GH_TOKEN="$(echo "$GH_TOKEN" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: No token pasted. Re-run when you have it ready."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Quick format sanity check — GitHub PATs start with ghp_ (classic) or
# github_pat_ (fine-grained). Don't enforce; just warn.
case "$GH_TOKEN" in
  ghp_*|github_pat_*)
    ;;
  *)
    echo "Note: that doesn't look like a GitHub PAT (usually starts with"
    echo "'ghp_' or 'github_pat_'). Continuing anyway — let's see if it works."
    echo
    ;;
esac

# -----------------------------------------------------------------------------
# 5. Rebuild remote URL with PAT embedded, push
# -----------------------------------------------------------------------------
echo "Step 4 of 4 — pushing to GitHub..."
echo

# Extract repo path from current remote (strip any old credentials)
REPO_PATH="$(echo "$CURRENT_REMOTE" | sed -E 's|^https://[^/]*github.com/||;s|^github.com/||')"
NEW_REMOTE="https://${GH_USERNAME}:${GH_TOKEN}@github.com/${REPO_PATH}"

git remote set-url origin "$NEW_REMOTE"

# Set git identity if it isn't yet
if [ -z "$(git config --global user.email)" ]; then
  echo "  (also setting your git identity for commit history)"
  read -r -p "  Your name (e.g. Val Vavarosyan): " GIT_NAME
  read -r -p "  Your email (e.g. you@example.com): " GIT_EMAIL
  git config --global user.name "$GIT_NAME"
  git config --global user.email "$GIT_EMAIL"
  echo
fi

# Make sure there's at least one commit
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "  Staging all files for initial commit..."
  git add -A
  git commit -m "Initial commit — Bell Data Intelligence (marketing + Portal + local engine)" \
    || true
fi

# Stage anything new just in case
git add -A 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "Initial commit — Bell Data Intelligence" 2>/dev/null || true
fi

git branch -M main

echo "  Pushing main branch..."
if git push -u origin main; then
  echo "  ✓ main pushed successfully"
else
  echo
  echo "  ✗ Push to main failed."
  echo "    Most common cause: the token doesn't have 'repo' scope."
  echo "    Re-run this script and double-check the scope when creating the token."
  read -r -p "Press Enter to close..." _
  exit 1
fi

echo
echo "  Creating + pushing develop branch..."
if git show-ref --verify --quiet refs/heads/develop; then
  git checkout develop
else
  git checkout -b develop
fi
git push -u origin develop
echo "  ✓ develop pushed"
echo

bar
echo "✓ Done."
bar
echo
echo "  Your code is now on GitHub at:"
echo "  $DISPLAY_REMOTE"
echo
echo "  Current branch: develop (your day-to-day working branch)"
echo
echo "  The token is saved in this folder's .git/config (local file only,"
echo "  never pushed to GitHub). To rotate the token later, just re-run this"
echo "  script with a new one."
echo
echo "  Next: continue with Phase 2 of DEPLOYMENT SETUP GUIDE.md to set up"
echo "  the Railway project."
echo
read -r -p "Press Enter to close..." _
