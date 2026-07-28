#!/usr/bin/env bash
# Builds all mode zips and publishes them as a GitHub release.
# Chrome Web Store submission stays manual: upload the production zip
# from the release assets to the dashboard afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch --quiet origin main
[ "$(git branch --show-current)" = "main" ] || { echo "Releases must be run from main." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Working tree is dirty; commit or stash first." >&2; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main is not in sync with origin/main; pull or push first." >&2; exit 1; }

version=$(node -p "require('./package.json').version")
tag="v$version"
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
download="https://github.com/$repo/releases/download/$tag"

pnpm zip:all

notes="[Download extension]($download/splits-connect-$version-production-chrome.zip)

Other downloads: [dev]($download/splits-connect-$version-dev-chrome.zip) · [staging]($download/splits-connect-$version-staging-chrome.zip) · [testing]($download/splits-connect-$version-testing-chrome.zip)
"

gh release create "$tag" .output/splits-connect-"$version"-*-chrome.zip \
  --title "$tag" --notes "$notes" --generate-notes

echo "Released $tag. Now upload splits-connect-$version-production-chrome.zip to the Chrome Web Store."
