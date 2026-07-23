import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveRoleCapabilities } from "@/lib/access/roleCapabilities";

type Args = {
    userId?: string | null;
    email?: string | null;
};

export async function resolvePrivilegedLearningAccess(args: Args) {
    const byId = args.userId
        ? await prisma.user.findUnique({
              where: { id: args.userId },
              select: { roles: true },
          })
        : null;

    const user =
        byId ??
        (args.email
            ? await prisma.user.findUnique({
                  where: { email: args.email },
                  select: { roles: true },
              })
            : null);

    const capabilities = resolveRoleCapabilities(user?.roles);

    return {
        ...capabilities,
        bypass: capabilities.canUnlockAll,
    };
}
