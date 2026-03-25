FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/runner/package.json apps/runner/package.json
COPY packages/code-contracts/package.json packages/code-contracts/package.json

RUN pnpm install --frozen-lockfile=false

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

COPY --from=builder /app ./

WORKDIR /app/apps/runner
EXPOSE 4001

CMD ["node", "dist/server.js"]