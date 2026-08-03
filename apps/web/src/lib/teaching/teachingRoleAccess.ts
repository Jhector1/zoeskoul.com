import { resolveRoleCapabilities } from "@/lib/access/roleCapabilities";

export type TeachingRoleAccess = {
  allowed: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  roles: string[];
};

export function resolveTeachingRoleAccess(args: {
  roles: readonly unknown[];
}): TeachingRoleAccess {
  const roleCapabilities = resolveRoleCapabilities(args.roles);

  return {
    allowed: roleCapabilities.isAdmin || roleCapabilities.isTeacher,
    isAdmin: roleCapabilities.isAdmin,
    isTeacher: roleCapabilities.isTeacher,
    roles: roleCapabilities.roles,
  };
}
