export type TeachingRoleAccess = {
  allowed: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  roles: string[];
};

function normalizeRoles(roles: readonly unknown[]) {
  return [...new Set(roles.map((role) => String(role).trim().toLowerCase()).filter(Boolean))];
}

function normalizeAdminEmails(values: readonly string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function resolveTeachingRoleAccess(args: {
  roles: readonly unknown[];
  email?: string | null;
  configuredAdminEmails?: readonly string[];
}): TeachingRoleAccess {
  const roles = normalizeRoles(args.roles);
  const configuredAdminEmails = normalizeAdminEmails(args.configuredAdminEmails ?? []);
  const email = args.email?.trim().toLowerCase() ?? null;
  const isAdmin = roles.includes("admin") || Boolean(email && configuredAdminEmails.has(email));
  const isTeacher = roles.includes("teacher");

  return {
    allowed: isAdmin || isTeacher,
    isAdmin,
    isTeacher,
    roles,
  };
}
