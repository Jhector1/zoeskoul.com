import {WORKSPACE_PROFILES} from "@zoeskoul/curriculum-profiles";

export function validateBlueprint(blueprint: any) {
  if (!blueprint.subjectSlug) throw new Error("Blueprint missing subjectSlug");
  if (!blueprint.profileId) throw new Error("Blueprint missing profileId");
  if (!blueprint.sourceLocale) throw new Error("Blueprint missing sourceLocale");
  if (blueprint.workspaceProfileId && !WORKSPACE_PROFILES[blueprint.workspaceProfileId]) {
    throw new Error(`Unknown workspaceProfileId: ${blueprint.workspaceProfileId}`);
  }
  for (const entry of blueprint.moduleSchedule ?? []) {
    if (!Number.isInteger(entry.moduleNumber)) {
      throw new Error("moduleSchedule[].moduleNumber must be an integer");
    }

    if (!Number.isInteger(entry.weekStart) || !Number.isInteger(entry.weekEnd)) {
      throw new Error("moduleSchedule[].weekStart and weekEnd must be integers");
    }

    if (entry.weekStart < 1 || entry.weekEnd < entry.weekStart) {
      throw new Error("moduleSchedule[] must have weekStart >= 1 and weekEnd >= weekStart");
    }
  }
  if (blueprint.modulePolicies) {
    for (const policy of blueprint.modulePolicies) {
      if (typeof policy.moduleNumber !== "number") {
        throw new Error("modulePolicies[].moduleNumber must be a number");
      }
    }
  }
}
