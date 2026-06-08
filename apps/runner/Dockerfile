FROM node:22-bookworm-slim AS app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY . .

RUN DATABASE_URL="postgresql://zoeskoul:zoeskoul@localhost:5432/zoeskoul?schema=public" pnpm install --frozen-lockfile
RUN DATABASE_URL="postgresql://zoeskoul:zoeskoul@localhost:5432/zoeskoul?schema=public" pnpm --filter @zoeskoul/runner... build

EXPOSE 4001

CMD ["pnpm", "--filter", "@zoeskoul/runner", "start"]
