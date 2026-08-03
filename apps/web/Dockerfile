FROM node:22-bookworm-slim AS app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN DATABASE_URL="postgresql://zoeskoul:zoeskoul@localhost:5432/zoeskoul?schema=public" \
    NODE_ENV=development \
    pnpm install --frozen-lockfile --prod=false

ENV NODE_ENV=production

RUN DATABASE_URL="postgresql://zoeskoul:zoeskoul@localhost:5432/zoeskoul?schema=public" \
    pnpm --filter @zoeskoul/web... build

EXPOSE 3000

CMD ["pnpm", "--filter", "@zoeskoul/web", "start"]
