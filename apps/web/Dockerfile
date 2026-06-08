FROM node:22-bookworm-slim AS app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable

COPY . .

RUN DATABASE_URL="postgresql://zoeskoul:zoeskoul@localhost:5432/zoeskoul?schema=public" pnpm install --frozen-lockfile
RUN DATABASE_URL="postgresql://zoeskoul:zoeskoul@localhost:5432/zoeskoul?schema=public" pnpm --filter @zoeskoul/web... build

EXPOSE 3000

CMD ["pnpm", "--filter", "@zoeskoul/web", "start"]
