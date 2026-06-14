#!/bin/bash
# Bell Data Intelligence — Clear a stuck Git lock
# Removes a stale .git/index.lock that can block "Push Changes".
cd "$(dirname "$0")" || exit 1

echo "=========================================================="
echo "   Bell Data Intelligence — Clear stuck Git lock"
echo "=========================================================="
echo ""

if [ ! -d .git ]; then
  echo "ERROR: this folder isn't a git repository."
  read -r -p "Press Enter to close..." _
  exit 1
fi

if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  if [ -f .git/index.lock ]; then
    echo "Could not remove .git/index.lock."
    echo "Close any other app doing git work (an editor, another Terminal),"
    echo "then double-click this again."
  else
    echo "Done — removed the stale lock (.git/index.lock)."
    echo ""
    echo "Now double-click 'Push Changes.command' again."
  fi
else
  echo "No lock file present — git is already clear."
  echo "You can run 'Push Changes.command'."
fi

echo ""
read -r -p "Press Enter to close..." _
