/** Private operator pilot only. Never enable public hosting through this lane. */
export function allowsTanstackPublishPilot(input: Readonly<{
  origin: string; projectId: string; sourceVersion: number;
  canPublish: boolean; env: Readonly<Record<string, string | undefined>>;
}>): boolean {
  return input.env.NODE_ENV === "development" &&
    input.env.ZOEBUILD_PUBLISH_ENABLED === "0" &&
    input.canPublish &&
    (input.origin === "http://localhost:3004" || input.origin === "http://127.0.0.1:3004") &&
    /^[A-Za-z0-9_-]{4,128}$/.test(input.projectId) &&
    Number.isSafeInteger(input.sourceVersion) && input.sourceVersion > 0 &&
    input.env.ZOEBUILD_PRIVATE_PUBLISH_PILOT === `${input.projectId}:${input.sourceVersion}`;
}
