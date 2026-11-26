# Phase 4F2B5E3C6: independent ZoeBuild image on the EXISTING runner host.
# Build from monorepo root; no payment secrets are passed at image build time.
FROM ghcr.io/jhector1/zoeskoul-node-base:22-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl openssh-client \
    && rm -rf /var/lib/apt/lists/*
COPY . .
ARG ZOEBUILD_BUILD_NATIVE_HMR=false
RUN case "$ZOEBUILD_BUILD_NATIVE_HMR" in true|false) ;; *) exit 1 ;; esac \
    && export NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_PREVIEW_EDITOR_ENABLED="$ZOEBUILD_BUILD_NATIVE_HMR" \
              NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_URL_ENABLED="$ZOEBUILD_BUILD_NATIVE_HMR" \
              NEXT_PUBLIC_ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED="$ZOEBUILD_BUILD_NATIVE_HMR" \
              NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN="https://runner.zoeskoul.com" \
              NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_HMR_LOCAL_HTTP_ENABLED=false \
              NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED=false \
    && export DATABASE_URL="postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public" \
    && NODE_ENV=development pnpm install --frozen-lockfile --prod=false \
    && pnpm --filter @zoeskoul/db exec prisma generate \
    && NODE_ENV=development pnpm --filter '@zoeskoul/zoebuild^...' --filter '@zoeskoul/db...' --filter '@zoeskoul/curriculum-registry...' --filter '@zoeskoul/curriculum-runtime...' --fail-if-no-match run --if-present build \
    && NODE_ENV=production pnpm --filter @zoeskoul/zoebuild build \
    && mkdir -p /app/apps/zoebuild/.next/cache \
    && chown -R node:node /app/apps/zoebuild/.next

ENV NODE_ENV=production
USER node
EXPOSE 3004
CMD ["pnpm", "--filter", "@zoeskoul/zoebuild", "start"]
