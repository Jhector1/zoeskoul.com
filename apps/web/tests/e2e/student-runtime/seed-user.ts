import { loadEnvConfig } from "@next/env";

const USER_EMAIL =
  "playwright.student.runtime@zoeskoul.local";
const USER_NAME =
  "Playwright Student Runtime";
const USER_MARKER =
  "__ZOESKOUL_E2E_USER__=";

async function main() {
  loadEnvConfig(
    process.cwd(),
    true,
    console,
    true,
  );

  const { prisma } = await import(
    "../../../src/lib/prisma"
  );

  try {
    const user = await prisma.user.upsert({
      where: {
        email: USER_EMAIL,
      },
      update: {
        name: USER_NAME,
        emailVerified: new Date(),
        roles: {
          set: ["student", "admin"],
        },
      },
      create: {
        email: USER_EMAIL,
        name: USER_NAME,
        emailVerified: new Date(),
        roles: ["student", "admin"],
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    process.stdout.write(
      USER_MARKER +
        JSON.stringify(user) +
        "\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    "Failed to seed the Playwright student-runtime user.",
  );
  console.error(error);
  process.exitCode = 1;
});
