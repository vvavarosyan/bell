#!/bin/bash
# Bell Data Intelligence — first-time GitHub setup
#
# Run this ONCE, after you've created an empty private repo on GitHub.
# It will:
#   1. Initialize git in this folder
#   2. Ask for your GitHub repo URL
#   3. Create the initial commit with everything we've built
#   4. Push to GitHub on the `main` branch
#   5. Create + push the `develop` branch (for staging)
#
# After this, use:
#   • Push Changes.command         — to push updates to staging
#   • Open Production Release.command — to ship staging → production

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Connect to GitHub"
bar
echo

# -----------------------------------------------------------------------------
# 1. Check git is installed
# -----------------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is not installed."
  echo "On macOS, run \`xcode-select --install\` (or install Xcode Command Line Tools)"
  echo "and then re-run this script."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. Are we already a git repo?
# -----------------------------------------------------------------------------
if [ -d ".git" ]; then
  echo "This folder is already a git repository."
  echo
  CURRENT_REMOTE="$(git config --get remote.origin.url || true)"
  if [ -n "$CURRENT_REMOTE" ]; then
    echo "Current GitHub remote: $CURRENT_REMOTE"
    echo
    echo "Looks like GitHub is already connected. Nothing to do here."
    echo "Use 'Push Changes.command' to push updates."
    echo
    read -r -p "Press Enter to close..." _
    exit 0
  fi
  echo "No remote is set yet. We'll set one now."
else
  echo "Initializing git repository in this folder..."
  git init -b main
  echo
fi

# -----------------------------------------------------------------------------
# 3. Ask for the GitHub repo URL
# -----------------------------------------------------------------------------
echo "Paste your GitHub repository URL below."
echo "(It looks like:  https://github.com/YOUR-USERNAME/bell-data-intelligence.git)"
echo
read -r -p "GitHub URL: " REPO_URL

# Trim whitespace
REPO_URL="$(echo "$REPO_URL" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [ -z "$REPO_URL" ]; then
  echo
  echo "ERROR: No URL entered. Re-run when you have your GitHub repo URL ready."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Ensure it ends with .git for clean HTTPS clones
case "$REPO_URL" in
  *.git) ;;
  https://github.com/*) REPO_URL="${REPO_URL%.git}.git" ;;
esac

echo
echo "Using remote: $REPO_URL"
echo

# -----------------------------------------------------------------------------
# 4. Configure git identity if not set
# -----------------------------------------------------------------------------
if [ -z "$(git config --global user.email)" ]; then
  echo "Git needs your name and email for commit history."
  read -r -p "Your name (e.g. Val Vavarosyan): " GIT_NAME
  read -r -p "Your email (e.g. you@example.com): " GIT_EMAIL
  git config --global user.name "$GIT_NAME"
  git config --global user.email "$GIT_EMAIL"
  echo
fi

# -----------------------------------------------------------------------------
# 5. Set the remote
# -----------------------------------------------------------------------------
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

# -----------------------------------------------------------------------------
# 6. Stage everything (respects .gitignore), commit, push main
# -----------------------------------------------------------------------------
echo "Staging all files..."
git add -A

# Anything to commit?
if git diff --cached --quiet; then
  echo
  echo "Nothing new to commit. The repo is already clean."
else
  echo "Creating initial commit..."
  git commit -m "Initial commit — Bell Data Intelligence (marketing + Portal + local engine)" \
    || true
fi

echo
echo "Pushing 'main' branch to GitHub..."
git branch -M main
if git push -u origin main; then
  echo "✓ main pushed successfully."
else
  echo
  echo "Push to main failed. Common reasons:"
  echo "  • The GitHub repo isn't empty (must be a fresh empty repo)"
  echo "  • Authentication: you may need to set up a Personal Access Token"
  echo "    or SSH key. See https://docs.github.com/en/authentication"
  read -r -p "Press Enter to close..." _
  exit 1
fi

# -----------------------------------------------------------------------------
# 7. Create + push develop branch (staging tracker)
# -----------------------------------------------------------------------------
echo
echo "Creating 'develop' branch for staging deploys..."
git checkout -b develop
git push -u origin develop

# Stay on develop — that's the default working branch
echo
bar
echo "✓ Done."
bar
echo
echo "  Your code is now on GitHub at:"
echo "  $REPO_URL"
echo
echo "  Current branch:  develop  (this is where you'll commit going forward)"
echo
echo "  Next steps:"
echo "  1. Follow Phase 2 of DEPLOYMENT SETUP GUIDE.md to set up Railway"
echo "  2. When you make code changes, double-click 'Push Changes.command'"
echo "  3. When ready to ship to production, double-click"
echo "     'Open Production Release.command'"
echo
read -r -p "Press Enter to close..." _
