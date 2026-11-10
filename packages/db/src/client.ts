import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { requireCanonicalDatabaseUrl } from "./databaseUrl.js";

type PrismaPgPool = ConstructorParameters<typeof PrismaPg>[0];

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
    prismaPgPool?: PrismaPgPool;
};

function createPrismaClient() {
    const pool =
        globalForPrisma.prismaPgPool ??
        // `pg` and `@prisma/adapter-pg` can resolve different `@types/pg` versions.
        // Cast to the adapter's accepted pool type to avoid a types-only mismatch.
        (new Pool({
            connectionString: requireCanonicalDatabaseUrl(),
        }) as unknown as PrismaPgPool);

    if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prismaPgPool = pool;
    }

    return new PrismaClient({
        adapter: new PrismaPg(pool),
        log:
            process.env.PRISMA_QUERY_LOG === "true"
                ? ["query", "error", "warn"]
                : ["error", "warn"],
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
    PracticeCatalog,
    PracticeSubject,
    PracticeModule,
    PracticeTopic,
    SubjectEnrollment,
    CourseCertificate,
} from "@prisma/client";
