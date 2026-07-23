export type RoleCapabilities = {
  roles: string[];
  isAdmin: boolean;
  isTeacher: boolean;
  canUnlockAll: boolean;
  canBypassBilling: boolean;
  canUseUnlimitedPractice: boolean;
};

export function resolveRoleCapabilities(roles: unknown): RoleCapabilities {
  const normalizedRoles = Array.isArray(roles)
    ? Array.from(
        new Set(
          roles
            .map((role) => String(role).trim().toLowerCase())
            .filter(Boolean),
        ),
      )
    : [];

  const isAdmin = normalizedRoles.includes("admin");
  const isTeacher = normalizedRoles.includes("teacher");

  return {
    roles: normalizedRoles,
    isAdmin,
    isTeacher,
    canUnlockAll: isAdmin || isTeacher,
    canBypassBilling: isAdmin || isTeacher,
    canUseUnlimitedPractice: isAdmin || isTeacher,
  };
}
