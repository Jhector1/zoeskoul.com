#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env" >&2
  exit 1
fi

# deploy.sh exports the exact image tag selected for the deployment.
# Preserve that caller-owned value across loading .env so a stale IMAGE_TAG
# stored in production configuration can never change the migration image.
CALLER_IMAGE_TAG_SET="${IMAGE_TAG+x}"
CALLER_IMAGE_TAG="${IMAGE_TAG-}"

# Preserve an explicit caller migration-command override as well.
CALLER_MIGRATE_COMMAND_SET="${MIGRATE_COMMAND+x}"
CALLER_MIGRATE_COMMAND="${MIGRATE_COMMAND-}"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ "$CALLER_IMAGE_TAG_SET" = "x" ]; then
  export IMAGE_TAG="$CALLER_IMAGE_TAG"
else
  # Standalone migrations follow the normal mutable production tag.
  # IMAGE_TAG values stored in .env are intentionally not authoritative.
  export IMAGE_TAG="prod"
fi

if [ "$CALLER_MIGRATE_COMMAND_SET" = "x" ]; then
  export MIGRATE_COMMAND="$CALLER_MIGRATE_COMMAND"
fi

: "${GHCR_OWNER:?required}"

CMD="${MIGRATE_COMMAND:-pnpm --filter @zoeskoul/web exec prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma}"
EXPECTED_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-web:${IMAGE_TAG}"

echo "Running production migration:"
echo "  image=${EXPECTED_IMAGE}"
echo "  command=${CMD}"

echo
echo "Verifying migration image..."
docker image inspect "$EXPECTED_IMAGE" \
  --format 'migration_image_id={{.Id}}'

echo
echo "Verifying migration bundle..."
IMAGE_TAG="$IMAGE_TAG" docker compose run \
  --rm \
  --no-deps \
  web \
  sh -lc '
    set -eu

    DIR=/app/packages/db/prisma/migrations

    test -d "$DIR"

    COUNT="$(find "$DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d " ")"

    echo "migration_container_image_ready=YES"
    echo "migration_count=${COUNT}"
  '

echo
echo "Applying migrations..."
IMAGE_TAG="$IMAGE_TAG" docker compose run \
  --rm \
  --no-deps \
  web \
  sh -lc "$CMD"
