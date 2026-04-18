# syntax=docker/dockerfile:1.7

FROM ubuntu:24.04 AS base

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG NODE_MAJOR=22
ARG PNPM_VERSION=10.33.0

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gpg \
    git \
    make \
    g++ \
    python3 \
    tini \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/runner/package.json apps/runner/package.json
COPY packages/code-contracts/package.json packages/code-contracts/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app /app
COPY . .

RUN pnpm --filter @zoeskoul/code-contracts build \
 && pnpm --filter @zoeskoul/runner build \
 && pnpm --filter @zoeskoul/runner deploy --prod --legacy /prod/runner

FROM ubuntu:24.04 AS runner

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG NODE_MAJOR=22

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gpg \
    tini \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && apt-get purge -y --auto-remove curl gpg \
 && rm -rf /var/lib/apt/lists/*

RUN if ! getent group 1000 >/dev/null; then groupadd --gid 1000 app; fi \
 && if ! getent passwd 1000 >/dev/null; then \
      useradd --uid 1000 --gid 1000 --create-home --home-dir /home/app --shell /usr/sbin/nologin app; \
    fi

WORKDIR /app

COPY --from=builder /prod/runner /app

RUN chown -R 1000:1000 /app

USER 1000:1000

EXPOSE 4001

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]