FROM ubuntu:24.04 AS base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    gpg \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY pnpm-lock.yaml ./
COPY apps/runner/package.json apps/runner/package.json
COPY packages/code-contracts/package.json packages/code-contracts/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/runner/node_modules ./apps/runner/node_modules
COPY --from=deps /app/packages/code-contracts/node_modules ./packages/code-contracts/node_modules

COPY . .

RUN pnpm --filter @zoeskoul/code-contracts build
RUN pnpm --filter @zoeskoul/runner build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN useradd -r -u 10001 -g users appuser

COPY --from=builder /app /app

USER 10001:100
WORKDIR /app/apps/runner

EXPOSE 4001
CMD ["node", "dist/server.js"]