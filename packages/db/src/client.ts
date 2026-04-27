import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
    prismaPgPool?: Pool;
};

function getDatabaseUrl() {
    const databaseUrl =
        process.env.ADMIN_DATABASE_URL ??
        process.env.WEB_DATABASE_URL ??
        process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error(
            "Missing DATABASE_URL. Set DATABASE_URL, WEB_DATABASE_URL, or ADMIN_DATABASE_URL.",
        );
    }

    return databaseUrl;
}

function createPrismaClient() {
    const pool =
        globalForPrisma.prismaPgPool ??
        new Pool({
            connectionString: getDatabaseUrl(),
        });

    if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prismaPgPool = pool;
    }

    return new PrismaClient({
        adapter: new PrismaPg(pool),
        log:
            process.env.NODE_ENV === "development"
                ? ["query", "error", "warn"]
                : ["error"],
    });
}

export function getPrismaClient() {
    if (!globalForPrisma.prisma) {
        globalForPrisma.prisma = createPrismaClient();
    }

    return globalForPrisma.prisma;
}

/**
 * Lazy Prisma proxy.
 *
 * This prevents Next build from failing just because a module imports `prisma`.
 * The real PrismaClient is created only when code actually accesses
 * `prisma.user`, `prisma.learnerProgress`, etc.
 */
export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
        return Reflect.get(getPrismaClient(), prop, receiver);
    },
}) as PrismaClient;

export { Prisma };
export {
    CodeProjectRole,
    CodeProjectScopeKind,
    CodeProjectVisibility,
    FeatureKey,
    PracticeDifficulty,
    PracticeKind,
    PracticePurpose,
    PracticeSessionStatus,
    StripeSubscriptionStatus,
    UserRole,
    XpSourceType,
} from "@prisma/client";
export type { PrismaClient };

export type {
    User,
    LearnerProgress,
    DailyLearningStat,
    XpEvent,
    ReviewProgress,
    PracticeSession,
    PracticeAttempt,
    PracticeSubject,
    PracticeModule,
    PracticeTopic,
    SubjectEnrollment,
    CourseCertificate,
} from "@prisma/client";
