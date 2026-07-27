import "server-only";

import { cache } from "react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  resolveRoleCapabilities,
  type RoleCapabilities,
} from "@/lib/access/roleCapabilities";

export type CurrentUserAccess = {
  authenticated: boolean;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
  } | null;
  capabilities: RoleCapabilities;
};

const EMPTY_CAPABILITIES = resolveRoleCapabilities([]);

/**
 * Resolves the authenticated user against Prisma on every request.
 *
 * The session establishes identity only. Database roles are the sole source
 * of authorization and are intentionally not inferred from email addresses
 * or environment variables.
 */
export const getCurrentUserAccess = cache(
  async (): Promise<CurrentUserAccess> => {
    const session = await auth();
    const userId = session?.user?.id?.trim() || null;
    const email = session?.user?.email?.trim().toLowerCase() || null;

    if (!userId && !email) {
      return {
        authenticated: false,
        user: null,
        capabilities: EMPTY_CAPABILITIES,
      };
    }

    // Email is only a compatibility fallback for sessions issued before uid
    // was added. It identifies a database row; it never grants privileges.
    const user = await prisma.user.findFirst({
      where: userId ? { id: userId } : { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        roles: true,
      },
    });

    if (!user) {
      return {
        authenticated: false,
        user: null,
        capabilities: EMPTY_CAPABILITIES,
      };
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
      capabilities: resolveRoleCapabilities(user.roles),
    };
  },
);
