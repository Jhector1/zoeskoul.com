import "server-only";

import { prisma } from "@/lib/prisma";

type Args = {
    userId?: string | null;
    email?: string | null;
};

export async function resolvePrivilegedLearningAccess(args: Args) {
    const user =
        args.userId
            ? await prisma.user.findUnique({
                  where: { id: args.userId },
                  select: { roles: true },
              })
            : args.email
              ? await prisma.user.findUnique({
                    where: { email: args.email },
                    select: { roles: true },
                })
              : null;

    const roles: string[] = (user as any)?.roles ?? [];
    const canUnlockAll =
        roles.includes("teacher") || roles.includes("admin");

    return {
        canUnlockAll,
        bypass: canUnlockAll,
        roles,
    };
}
