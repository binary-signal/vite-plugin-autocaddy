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

# Bump version, update CHANGELOG.md, commit, tag, and push
pnpm dlx changelogen --release --push

# Create GitHub release with auto-generated notes
VERSION="v$(node -p "require('./package.json').version")"
gh release create "$VERSION" --generate-notes
