export const APP_ROLES = [
  "student",
  "teacher",
  "admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type RoleCapabilities = {
  roles: string[];
  appRoles: AppRole[];
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

export function resolveRoleCapabilities(roles: unknown): RoleCapabilities {
  const normalizedRoles = normalizeRoleStrings(roles);
  const appRoles = normalizeAppRoles(normalizedRoles);
  const isStudent = appRoles.includes("student");
  const isTeacher = appRoles.includes("teacher");
  const isAdmin = appRoles.includes("admin");
  const canTeach = isTeacher || isAdmin;
  const hasKnownRole = appRoles.length > 0;

  return {
    roles: normalizedRoles,
    appRoles,
    isStudent,
    isTeacher,
    isAdmin,
    accessStudentApp: isStudent || canTeach,
    accessTeacherApp: canTeach,
    accessAdminApp: isAdmin,
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
