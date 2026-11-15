#!/usr/bin/env bash
# Safe local acceptance: no admin grants, no backend mutations, no publish.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

[[ "$(git branch --show-current)" == "feat/zoelearning-admin-ghcr" ]] || {
  echo "STOP: unexpected ZoeLearning branch" >&2
  exit 1
}
git merge-base --is-ancestor 20e72885f7584e82de32fde0b61c2955c526fe1c HEAD || {
  echo "STOP: expected Stage 4B9BF2 commit is not an ancestor" >&2
  exit 1
}

python3 scripts/zoelearning/single_pipeline/test_audit.py --repo "$ROOT"
python3 scripts/zoelearning/single_pipeline/audit.py --repo "$ROOT"

pnpm exec vitest run \
  apps/web/src/lib/practice/api/validate/handler.singlePipeline.acceptance.test.ts \
  apps/web/src/lib/practice/api/validate/handler.runnerUnavailable.test.ts \
  apps/web/src/lib/practice/api/validate/grade/verifyAdminLabFilesystem.test.ts \
  apps/web/src/lib/practice/api/validate/grade/adminLabFilesystemEvidencePolicy.test.ts \
  apps/web/src/lib/practice/adminLab/approvedPublishedCourse2Capstone.test.ts \
  apps/web/src/lib/practice/expected/normalizeExpectedForSave.test.ts \
  apps/web/src/lib/practice/generator/engines/json/buildExerciseFromManifest.test.ts

pnpm exec tsc -p apps/web/tsconfig.json --noEmit
git diff --check

echo "STAGE4B9BF3C_LOCAL_SHARED_GRADING_CONTRACT_PASS"
echo "RUNNER_LIVE_END_TO_END_NOT_EXECUTED"
echo "COURSE2_APPROVAL_AND_PUBLICATION_NOT_CHANGED"
