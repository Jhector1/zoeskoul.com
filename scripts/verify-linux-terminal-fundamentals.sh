#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

node scripts/harden-linux-terminal-fundamentals.mjs

node packages/curriculum-cli/dist/index.js validate-subject linux

RUN_DRAFT_CODE_INPUT_GOLDENS=1 \
  pnpm curr:course -- draft-goldens linux linux-terminal-fundamentals

pnpm --filter @zoeskoul/web exec vitest run \
  src/components/sketches/subjects/getDistinctSketchShellTitle.test.ts

pnpm --filter @zoeskoul/web gen:manifests
pnpm --filter @zoeskoul/web typecheck
pnpm build
