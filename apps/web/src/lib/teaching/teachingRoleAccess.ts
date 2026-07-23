import { resolveRoleCapabilities } from "@/lib/access/roleCapabilities";

export type TeachingRoleAccess = {
  allowed: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  roles: string[];
};

function normalizeAdminEmails(values: readonly string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function resolveTeachingRoleAccess(args: {
  roles: readonly unknown[];
  email?: string | null;
  configuredAdminEmails?: readonly string[];
}): TeachingRoleAccess {
  const roleCapabilities = resolveRoleCapabilities(args.roles);
  const configuredAdminEmails = normalizeAdminEmails(args.configuredAdminEmails ?? []);
  const email = args.email?.trim().toLowerCase() ?? null;
  const isAdmin =
    roleCapabilities.isAdmin ||
    Boolean(email && configuredAdminEmails.has(email));
  const isTeacher = roleCapabilities.isTeacher;
  const roles = roleCapabilities.roles;

  return {
    allowed: isAdmin || isTeacher,
    isAdmin,
    isTeacher,
    roles,
  };
}
