#!/usr/bin/env bash
set -euo pipefail

# Ensure working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working directory has uncommitted changes"
  exit 1
fi

# Build and lint before releasing
pnpm build
pnpm lint

# Bump version, update CHANGELOG.md (no tag — GitHub creates it on release)
pnpm dlx changelogen --bump

# Commit and push the version bump
VERSION="v$(node -p "require('./package.json').version")"
git add -A
git commit -m "chore: release $VERSION"
git push

# Create GitHub release (this creates the tag)
gh release create "$VERSION" --generate-notes
