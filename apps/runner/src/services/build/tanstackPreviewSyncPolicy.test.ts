import { describe, expect, it } from "vitest";
import { TANSTACK_PREVIEW_RESTART_REQUIRED, type ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { requireTanstackPreviewRestart } from "./tanstackPreviewSyncPolicy.js";

const lease = {
  ownerKey: "actor-1", buildProjectId: "project-1", sourceVersion: 8,
  basePath: "/api/build/projects/project-1/preview/preview_123/content/cap/",
};
const request: ProductionBuildJobRequestV1 = {
  protocolVersion: 1, operation: "production-build", buildProjectId: "project-1",
  stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
  sourceVersion: 9, files: [],
};

describe("TanStack isolated preview sync handoff", () => {
  it("requires a new verified start without changing the current lease", () => {
    const unchanged = { ...lease };
    expect(() => requireTanstackPreviewRestart({ lease, ownerKey: "actor-1", request }))
      .toThrow(TANSTACK_PREVIEW_RESTART_REQUIRED);
    expect(lease).toEqual(unchanged);
  });
  it("rejects a different owner before indicating whether a restart is possible", () => {
    expect(() => requireTanstackPreviewRestart({ lease, ownerKey: "actor-2", request }))
      .toThrow("Forbidden.");
  });
  it("rejects cross-project and retired source versions", () => {
    expect(() => requireTanstackPreviewRestart({ lease, ownerKey: "actor-1",
      request: { ...request, buildProjectId: "project-2" } })).toThrow("Preview source is stale.");
    expect(() => requireTanstackPreviewRestart({ lease, ownerKey: "actor-1",
      request: { ...request, sourceVersion: 7 } })).toThrow("Preview source is stale.");
  });
  it("rejects a legacy-stack mutation of an active TanStack lease", () => {
    expect(() => requireTanstackPreviewRestart({ lease, ownerKey: "actor-1",
      request: { ...request, templateId: "react-vite-v1" } })).toThrow("Invalid TanStack preview identity.");
  });
  it("never converts a missing or quarantined lease into a fresh preview", () => {
    expect(() => requireTanstackPreviewRestart({ lease: null, ownerKey: "actor-1", request }))
      .toThrow("Preview not found.");
    expect(() => requireTanstackPreviewRestart({ lease: { ...lease, basePath: "/quarantined/id/" },
      ownerKey: "actor-1", request })).toThrow("Preview not found.");
  });
});
