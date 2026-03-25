import { loadEnvConfig } from "@next/env";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

delete process.env.DATABASE_URL;

const dev = process.env.NODE_ENV !== "production";
const { loadedEnvFiles } = loadEnvConfig(process.cwd(), dev, console, true);

const databaseUrl = process.env.DATABASE_URL;

console.log("Loaded env files:");
console.log("DATABASE_URL starts with:");

if (!databaseUrl) {
    throw new Error(
        "DATABASE_URL is not set. Make sure it exists in .env or .env.local and run this command from the project root."
    );
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const VALID_ROLES = new Set(Object.values(UserRole));

type Args = {
    id?: string;
    email?: string;
    roles: UserRole[];
};

function parseArgs(argv: string[]): Args {
    const out: Partial<Args> = {};

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];

        if (a === "--id") out.id = argv[++i];
        else if (a === "--email") out.email = argv[++i];
        else if (a === "--roles") {
            const raw = argv[++i] ?? "";
            const roles = raw
                .split(",")
                .map((r) => r.trim())
                .filter(Boolean);

            for (const role of roles) {
                if (!VALID_ROLES.has(role as UserRole)) {
                    throw new Error(
                        `Invalid role "${role}". Valid roles: ${[...VALID_ROLES].join(", ")}`
                    );
                }
            }

            out.roles = roles as UserRole[];
        }
    }

    if (!out.id && !out.email) {
        throw new Error('Provide either "--id <userId>" or "--email <email>"');
    }

    if (!out.roles || out.roles.length === 0) {
        throw new Error(
            'Provide roles with "--roles admin" or "--roles student,teacher"'
        );
    }

    return out as Args;
}

async function main() {
    const { id, email, roles } = parseArgs(process.argv.slice(2));

    const updated = await prisma.user.update({
        where: id ? { id } : { email: email! },
        data: {
            roles: {
                set: roles,
            },
        },
        select: {
            id: true,
            email: true,
            name: true,
            roles: true,
            updatedAt: true,
        },
    });

    console.log(JSON.stringify(updated, null, 2));
}

main()
    .catch((err) => {
        console.error("Failed to update user roles.");
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });