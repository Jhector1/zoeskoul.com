#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WEB_ROOT"

cleanup() {
  rm -f -- apps packages authoring
}
trap cleanup EXIT INT TERM

for projection in apps packages authoring; do
  if [ -e "$projection" ] || [ -L "$projection" ]; then
    echo "ERROR: $WEB_ROOT/$projection already exists; refusing to replace it."
    exit 1
  fi
done

ln -s ../../apps apps
ln -s ../../packages packages
ln -s ../../authoring authoring

test -f package.json || {
  echo "ERROR: Web package root is unavailable."
  exit 1
}

test -d src || {
  echo "ERROR: Web src root is unavailable."
  exit 1
}

test -f apps/web/package.json || {
  echo "ERROR: repo-relative apps/web view is unavailable."
  exit 1
}

test -f packages/db/prisma/schema.prisma || {
  echo "ERROR: repo-relative packages view is unavailable."
  exit 1
}

test -d authoring || {
  echo "ERROR: repo-relative authoring view is unavailable."
  exit 1
}

echo "web_test_cwd=$PWD"
echo "app_root_view=PASS"
echo "repo_apps_projection=PASS"
echo "repo_packages_projection=PASS"

pnpm exec vitest run "$@"
