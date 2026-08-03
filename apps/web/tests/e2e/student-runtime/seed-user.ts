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

    /**
     * student-simple-quiz-visible-e2e
     *
     * This fixed user is reused between Playwright runs. Clear only data
     * owned by this dedicated account so the visible quiz must launch,
     * submit, and persist from a fresh state every time.
     */
    const actorKey = `u:${user.id}`;

    await prisma.$transaction(async (tx) => {
      const sessions =
        await tx.practiceSession.findMany({
          where: {
            userId: user.id,
          },
          select: {
            id: true,
          },
        });
      const sessionIds = sessions.map(
        (session) => session.id,
      );

      const userAttemptInstances =
        await tx.practiceAttempt.findMany({
          where: {
            userId: user.id,
          },
          select: {
            instanceId: true,
          },
        });

      const sessionInstances = sessionIds.length
        ? await tx.practiceQuestionInstance.findMany({
            where: {
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              id: true,
            },
          })
        : [];

      const instanceIds = Array.from(
        new Set([
          ...userAttemptInstances.map(
            (attempt) => attempt.instanceId,
          ),
          ...sessionInstances.map(
            (instance) => instance.id,
          ),
        ]),
      );

      await tx.reviewProgress.deleteMany({
        where: {
          actorKey,
        },
      });
      await tx.reviewQuizInstance.deleteMany({
        where: {
          actorKey,
        },
      });
      await tx.xpEvent.deleteMany({
        where: {
          actorKey,
        },
      });
      await tx.dailyLearningStat.deleteMany({
        where: {
          actorKey,
        },
      });
      await tx.learnerProgress.deleteMany({
        where: {
          actorKey,
        },
      });

      await tx.practiceAttempt.deleteMany({
        where: {
          OR: [
            {
              userId: user.id,
            },
            ...(sessionIds.length
              ? [
                  {
                    sessionId: {
                      in: sessionIds,
                    },
                  },
                ]
              : []),
            ...(instanceIds.length
              ? [
                  {
                    instanceId: {
                      in: instanceIds,
                    },
                  },
                ]
              : []),
          ],
        },
      });

      await tx.practiceHelpEvent.deleteMany({
        where: {
          OR: [
            {
              userId: user.id,
            },
            ...(sessionIds.length
              ? [
                  {
                    sessionId: {
                      in: sessionIds,
                    },
                  },
                ]
              : []),
            ...(instanceIds.length
              ? [
                  {
                    instanceId: {
                      in: instanceIds,
                    },
                  },
                ]
              : []),
          ],
        },
      });

      if (instanceIds.length) {
        await tx.practiceQuestionInstance.deleteMany({
          where: {
            id: {
              in: instanceIds,
            },
          },
        });
      }

      if (sessionIds.length) {
        await tx.practiceSession.deleteMany({
          where: {
            id: {
              in: sessionIds,
            },
          },
        });
      }
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
