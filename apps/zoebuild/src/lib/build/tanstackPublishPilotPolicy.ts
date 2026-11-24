/** Private operator pilot only. Never enable public hosting through this lane. */
export function allowsTanstackPublishPilot(input: Readonly<{
  origin: string; projectId: string; sourceVersion: number;
  canPublish: boolean; userId?: string | null; env: Readonly<Record<string, string | undefined>>;
}>): boolean {
  // This local-only operator selection is not a paid entitlement and must
  // never be consumed by public publishing or billing. If supplied, the
  // selected owner must match even when the actor has a paid entitlement.
  const selectedOwner = input.env.ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER;
  const ownerSelected = selectedOwner !== undefined &&
    /^[A-Za-z0-9_-]{4,128}$/.test(selectedOwner) &&
    input.userId === selectedOwner;
  const authorized = selectedOwner === undefined ? input.canPublish : ownerSelected;
  return input.env.NODE_ENV === "development" &&
    input.env.ZOEBUILD_PUBLISH_ENABLED === "0" &&
    authorized &&
    (input.origin === "http://localhost:3004" || input.origin === "http://127.0.0.1:3004") &&
    /^[A-Za-z0-9_-]{4,128}$/.test(input.projectId) &&
    Number.isSafeInteger(input.sourceVersion) && input.sourceVersion > 0 &&
    input.env.ZOEBUILD_PRIVATE_PUBLISH_PILOT === `${input.projectId}:${input.sourceVersion}`;
}
