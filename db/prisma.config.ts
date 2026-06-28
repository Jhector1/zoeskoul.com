import { defineConfig, env } from "prisma/config";
import { loadDbEnv } from "./prisma/loadEnv";

loadDbEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/seed.ts",
  },
});
