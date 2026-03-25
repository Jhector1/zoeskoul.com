// prisma.index.ts
import { defineConfig } from "prisma/config";
import { config } from "dotenv";

// Load the same env files Next uses (order matters)
config({ path: ".env.development.local.local" });
config({ path: ".env.development.local" });

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        seed: "tsx prisma/seed/seed.ts",
    },
    datasource: {
        url: process.env.DATABASE_URL!,
    },
});