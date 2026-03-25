import "server-only";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

export async function canUnlockAllForUser(userId?: string | null) {
    if (!userId) return false;

    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { roles: true },
    });

    const roles = u?.roles ?? [];
    return roles.includes(UserRole.admin) || roles.includes(UserRole.teacher);
}
