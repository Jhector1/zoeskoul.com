# Phase 4F2B5E3C6: independent ZoeBuild image on the EXISTING runner host.
# Build from monorepo root; no payment secrets are passed at image build time.
FROM ghcr.io/jhector1/zoeskoul-node-base:22-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN NODE_ENV=development pnpm install --frozen-lockfile --prod=false \
    && pnpm --filter @zoeskoul/db exec prisma generate \
    && NODE_ENV=production pnpm --filter @zoeskoul/zoebuild build \
    && mkdir -p /app/apps/zoebuild/.next/cache \
    && chown -R node:node /app/apps/zoebuild/.next

ENV NODE_ENV=production
USER node
EXPOSE 3004
CMD ["pnpm", "--filter", "@zoeskoul/zoebuild", "start"]
