import { defineConfig, env } from "prisma/config";
import { loadDbEnv } from "../../packages/db/prisma/loadEnv";

loadDbEnv();

export default defineConfig({
  schema: "../../packages/db/prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "../../packages/db/prisma/migrations",
    seed: "pnpm --dir ../.. --filter @zoeskoul/db db:seed",
  },
});
