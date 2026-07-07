export const MODULE_ASSIGNMENT_META_KIND = "module_assignment" as const;

/**
 * Review-module assignments are not rows in the Assignment table. The
 * database constraint for PracticeSession.mode="assignment" intentionally
 * requires assignmentId, so module assignments persist as standard sessions
 * and are promoted to the assignment product experience through their meta.
 */
export const MODULE_ASSIGNMENT_STORAGE_MODE = "standard" as const;

export type ModuleAssignmentMeta = {
  kind: typeof MODULE_ASSIGNMENT_META_KIND;
  source?: string;
  moduleSlug?: string;
};

export function readModuleAssignmentMeta(meta: unknown): ModuleAssignmentMeta | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;

  const record = meta as Record<string, unknown>;
  if (record.kind !== MODULE_ASSIGNMENT_META_KIND) return null;

  return {
    kind: MODULE_ASSIGNMENT_META_KIND,
    source: typeof record.source === "string" ? record.source : undefined,
    moduleSlug:
      typeof record.moduleSlug === "string" ? record.moduleSlug : undefined,
  };
}

export function isModuleAssignmentMeta(meta: unknown): boolean {
  return readModuleAssignmentMeta(meta) !== null;
}

export function moduleAssignmentExperienceKey(userId: string, moduleId: string) {
  return `module-assignment:${userId}:${moduleId}`;
}
