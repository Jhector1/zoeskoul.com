export const APP_ROLES = [
  "student",
  "teacher",
  "admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const APP_CAPABILITIES = [
  "student:access",
  "teacher:access",
  "admin:access",
] as const;

export type AppCapability =
  (typeof APP_CAPABILITIES)[number];

export type RoleCapabilities = {
  roles: string[];
  appRoles: AppRole[];
  capabilities: AppCapability[];
  isStudent: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  accessStudentApp: boolean;
  accessTeacherApp: boolean;
  accessAdminApp: boolean;
  canUnlockAll: boolean;
  canBypassBilling: boolean;
  canUseUnlimitedPractice: boolean;
  canCreateAssignments: boolean;
  canManageTutoringSessions: boolean;
  canEditOwnWorkspace: boolean;
  canEditTutorWorkspace: boolean;
  canInspectLearnerWorkspaces: boolean;
  canEditLearnerWorkspaces: boolean;
};

function normalizeRoleStrings(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];

  return Array.from(
    new Set(
      roles
        .map((role) => String(role).trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function isAppRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" &&
    (APP_ROLES as readonly string[]).includes(value)
  );
}

export function isAppCapability(
  value: unknown,
): value is AppCapability {
  return (
    typeof value === "string" &&
    (APP_CAPABILITIES as readonly string[]).includes(value)
  );
}

export function normalizeAppRoles(roles: unknown): AppRole[] {
  const normalized = normalizeRoleStrings(roles);
  const appRoles: AppRole[] = [];

  for (const role of normalized) {
    const mappedRole = role === "learner" ? "student" : role;

    if (
      (APP_ROLES as readonly string[]).includes(mappedRole) &&
      !appRoles.includes(mappedRole as AppRole)
    ) {
      appRoles.push(mappedRole as AppRole);
    }
  }

  return appRoles;
}

export function resolveAppCapabilities(
  roles: unknown,
): AppCapability[] {
  const appRoles = normalizeAppRoles(roles);
  const capabilities: AppCapability[] = [];

  if (appRoles.includes("student")) {
    capabilities.push("student:access");
  }

  if (
    appRoles.includes("teacher") ||
    appRoles.includes("admin")
  ) {
    capabilities.push(
      "student:access",
      "teacher:access",
    );
  }

  if (appRoles.includes("admin")) {
    capabilities.push("admin:access");
  }

  return Array.from(
    new Set(capabilities),
  ).sort(
    (left, right) =>
      APP_CAPABILITIES.indexOf(left) -
      APP_CAPABILITIES.indexOf(right),
  );
}

export function resolveRoleCapabilities(roles: unknown): RoleCapabilities {
  const normalizedRoles = normalizeRoleStrings(roles);
  const appRoles = normalizeAppRoles(normalizedRoles);
  const capabilities =
    resolveAppCapabilities(appRoles);
  const isStudent = appRoles.includes("student");
  const isTeacher = appRoles.includes("teacher");
  const isAdmin = appRoles.includes("admin");
  const canTeach = isTeacher || isAdmin;
  const hasKnownRole = appRoles.length > 0;

  return {
    roles: normalizedRoles,
    appRoles,
    capabilities,
    isStudent,
    isTeacher,
    isAdmin,
    accessStudentApp:
      capabilities.includes("student:access"),
    accessTeacherApp:
      capabilities.includes("teacher:access"),
    accessAdminApp:
      capabilities.includes("admin:access"),
    canUnlockAll: canTeach,
    canBypassBilling: canTeach,
    canUseUnlimitedPractice: canTeach,
    canCreateAssignments: canTeach,
    canManageTutoringSessions: canTeach,
    canEditOwnWorkspace: hasKnownRole,
    canEditTutorWorkspace: canTeach,
    canInspectLearnerWorkspaces: canTeach,
    canEditLearnerWorkspaces: false,
  };
}
