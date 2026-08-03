import {
  type AppRole,
  resolveRoleCapabilities,
} from "@zoeskoul/permissions";

export function resolveLegacyStudentAccess(
  roles: readonly AppRole[],
) {
  const {
    canUnlockAll,
  } = resolveRoleCapabilities(roles);

  return {
    canUnlockAll,
  };
}
