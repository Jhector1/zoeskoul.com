#!/usr/bin/env bash
# Promote only already-published immutable GHCR candidates. Never rebuild here.
set -euo pipefail

: "${TARGET_COMMIT:?commit SHA is required}"
: "${TARGET_COMPONENT:?component is required}"
: "${GITHUB_REPOSITORY_OWNER:?repository owner is required}"

if [[ ! "$TARGET_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: require a full lowercase 40-character Git commit SHA" >&2
  exit 2
fi

# Do not permit promotion of a PR-only or unreviewed off-main revision.
git fetch --no-tags origin main:refs/remotes/origin/main
if ! git cat-file -e "${TARGET_COMMIT}^{commit}" 2>/dev/null ||
   ! git merge-base --is-ancestor "$TARGET_COMMIT" origin/main; then
  echo "ERROR: candidate revision is not a commit reachable from origin/main" >&2
  exit 2
fi

case "$TARGET_COMPONENT" in
  web) images=(zoeskoul-web) ;;
  runner) images=(zoeskoul-runner) ;;
  runtime) images=(zoeskoul-runtime) ;;
  all) images=(zoeskoul-web zoeskoul-runner zoeskoul-runtime) ;;
  *) echo "ERROR: invalid component '$TARGET_COMPONENT'" >&2; exit 2 ;;
esac

owner="$(printf '%s' "$GITHUB_REPOSITORY_OWNER" | LC_ALL=C tr '[:upper:]' '[:lower:]')"
if [[ ! "$owner" =~ ^[a-z0-9-]+$ ]]; then
  echo "ERROR: invalid GHCR owner" >&2
  exit 2
fi

# Fail closed if GitHub Actions cannot prove this exact SHA had a successful
# image-specific build AND digest-recording step. A failed sibling is allowed.
# The verifier uses the current repository's workflow/job results, not a
# subjective overall run conclusion.
python3 scripts/ci/verify-image-build-checks.py

# All candidates are inspected before changing even one prod tag.
references=()
digests=()
for image in "${images[@]}"; do
  repo="ghcr.io/${owner}/${image}"
  candidate="${repo}:${TARGET_COMMIT}"
  echo "PRECHECK: ${candidate}"
  detail="$(docker buildx imagetools inspect "$candidate")" || {
    echo "ERROR: candidate image does not exist: ${candidate}" >&2
    exit 1
  }
  digest="$(printf '%s\n' "$detail" | sed -nE 's/^Digest:[[:space:]]*(sha256:[a-f0-9]{64}).*/\1/p' | head -n 1)"
  if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "ERROR: cannot resolve a trustworthy registry digest for ${candidate}" >&2
    exit 1
  fi
  docker buildx imagetools inspect "${repo}@${digest}" >/dev/null
  references+=("$repo")
  digests+=("$digest")
done

echo "PRECHECK_PASS: ${#references[@]} immutable image(s) verified"

for i in "${!references[@]}"; do
  repo="${references[$i]}"
  digest="${digests[$i]}"
  source="${repo}@${digest}"
  dest="${repo}:prod"
  echo "PROMOTE: $source -> $dest"
  docker buildx imagetools create --prefer-index=false --tag "$dest" "$source"

  verified="$(docker buildx imagetools inspect "$dest")"
  current="$(printf '%s\n' "$verified" | sed -nE 's/^Digest:[[:space:]]*(sha256:[a-f0-9]{64}).*/\1/p' | head -n 1)"
  if [[ "$current" != "$digest" ]]; then
    echo "ERROR: promotion verification mismatch for $repo; other tags may already have advanced" >&2
    exit 1
  fi
  echo "PROMOTE_PASS: ${dest} = ${digest}"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf -- '- `%s` → `%s` (commit `%s`)\n' "$dest" "$digest" "$TARGET_COMMIT" >> "$GITHUB_STEP_SUMMARY"
  fi
done
