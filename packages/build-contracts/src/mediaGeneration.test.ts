import { describe, expect, it } from "vitest";
import {
  assertBuildMediaJobTransition,
  assertSameBuildMediaScope,
  buildMediaAssetHandle,
  buildMediaObjectKey,
  listEligibleBuildMediaProviders,
  parseBuildMediaAsset,
  parseBuildMediaGenerationRequest,
} from "./mediaGeneration";

const scope = { ownerId: "user_12345678", buildProjectId: "cm3project12345678" };
const assetId = "asset_123456789";
const sha = "a".repeat(64);
const base = {
  idempotencyKey: "generation_123456789", kind: "image", mode: "draft",
  instruction: "A clear UI illustration of a forest", referenceAssetIds: [],
};
const image = {
  id: assetId, scope, kind: "image", origin: "generated", visibility: "private", state: "ready",
  sha256: sha, objectKey: buildMediaObjectKey(scope, assetId, sha),
  mimeType: "image/webp", byteLength: 14850, width: 1024, height: 768,
  durationMs: null, altText: "Forest illustration", providerId: "sample-provider", modelId: "model/fast",
};
const capabilities = [
  { providerId: "image-service", modelId: "image/fast", kinds: ["image"] as const, modes: ["draft"] as const, acceptsReferenceAssets: false, asynchronous: false },
  { providerId: "video-service", modelId: "video/alpha", kinds: ["video"] as const, modes: ["draft", "final"] as const, acceptsReferenceAssets: true, asynchronous: true },
  { providerId: "image-service", modelId: "image/edit", kinds: ["image"] as const, modes: ["draft", "final"] as const, acceptsReferenceAssets: true, asynchronous: true },
];
const availability = [
  { providerId: "image-service", modelId: "image/fast", configured: true, measuredP95Ms: 1200 },
  { providerId: "video-service", modelId: "video/alpha", configured: false },
  { providerId: "image-service", modelId: "image/edit", configured: true, measuredP95Ms: 800 },
];

describe("project-owned AI media boundary", () => {
  it("accepts arbitrary application-focused instructions without categorizing them", () => {
    expect(parseBuildMediaGenerationRequest({ ...base, instruction: "  Illustrate a chess game without a website  " }, scope).instruction).toBe("Illustrate a chess game without a website");
  });
  it("rejects empty or oversized prompts and unknown executable fields", () => {
    expect(() => parseBuildMediaGenerationRequest({ ...base, instruction: " " }, scope)).toThrow();
    expect(() => parseBuildMediaGenerationRequest({ ...base, instruction: "a".repeat(8001) }, scope)).toThrow();
    expect(() => parseBuildMediaGenerationRequest({ ...base, apiKey: "unsafe" }, scope)).toThrow();
  });
  it("rejects cross-project and forged-owner asset use", () => {
    expect(() => assertSameBuildMediaScope(scope, { ...scope, buildProjectId: "other-project1" })).toThrow();
    expect(() => parseBuildMediaAsset({ ...image, scope: { ...scope, ownerId: "another_user" } }, scope)).toThrow();
  });
  it("uses server-derived scope and refuses spoofed request scope", () => {
    expect(parseBuildMediaGenerationRequest(base, scope).scope).toEqual(scope);
    expect(() => parseBuildMediaGenerationRequest({ ...base, scope: { ...scope, ownerId: "another_user" } }, scope)).toThrow();
  });
  it("rejects references outside bounded unique asset IDs", () => {
    expect(() => parseBuildMediaGenerationRequest({ ...base, referenceAssetIds: Array(5).fill(assetId) }, scope)).toThrow();
    expect(() => parseBuildMediaGenerationRequest({ ...base, referenceAssetIds: [assetId, assetId] }, scope)).toThrow();
    expect(() => parseBuildMediaGenerationRequest({ ...base, referenceAssetIds: ["../etc/passwd"] }, scope)).toThrow();
  });
  it("produces immutable owner/project-scoped storage keys", () => {
    expect(buildMediaObjectKey(scope, assetId, sha)).toContain(scope.buildProjectId);
    expect(() => buildMediaObjectKey(scope, "../private", sha)).toThrow();
    expect(() => buildMediaObjectKey(scope, assetId, "invalid")).toThrow();
    expect(buildMediaAssetHandle(assetId)).toBe(`zoebuild:asset:${assetId}`);
  });
  it("validates ready private images with provenance", () => {
    expect(parseBuildMediaAsset(image, scope).mimeType).toBe("image/webp");
    expect(() => parseBuildMediaAsset({ ...image, state: "running" }, scope)).toThrow();
    expect(() => parseBuildMediaAsset({ ...image, objectKey: "project-media/another/data" }, scope)).toThrow();
  });
  it("rejects unverified MIME and inconsistent image metadata", () => {
    expect(() => parseBuildMediaAsset({ ...image, mimeType: "image/svg+xml" }, scope)).toThrow();
    expect(() => parseBuildMediaAsset({ ...image, durationMs: 100 }, scope)).toThrow();
    expect(() => parseBuildMediaAsset({ ...image, width: null }, scope)).toThrow();
    expect(() => parseBuildMediaAsset({ ...image, byteLength: 10000000000 }, scope)).toThrow();
  });
  it("accepts bounded video with duration and rejects missing duration", () => {
    const video = { ...image, kind: "video", mimeType: "video/mp4", width: null, height: null, durationMs: 5000, altText: null };
    expect(parseBuildMediaAsset(video, scope).durationMs).toBe(5000);
    expect(() => parseBuildMediaAsset({ ...video, durationMs: null }, scope)).toThrow();
  });
  it("enforces generated-versus-uploaded provenance consistency", () => {
    expect(() => parseBuildMediaAsset({ ...image, providerId: null }, scope)).toThrow();
    expect(() => parseBuildMediaAsset({ ...image, origin: "uploaded" }, scope)).toThrow();
    expect(parseBuildMediaAsset({ ...image, origin: "uploaded", providerId: null, modelId: null }, scope).origin).toBe("uploaded");
  });
  it("enforces job ordering without forcing immediate completion", () => {
    expect(() => assertBuildMediaJobTransition("queued", "running")).not.toThrow();
    expect(() => assertBuildMediaJobTransition("running", "verifying")).not.toThrow();
    expect(() => assertBuildMediaJobTransition("verifying", "ready")).not.toThrow();
    expect(() => assertBuildMediaJobTransition("queued", "ready")).toThrow();
    expect(() => assertBuildMediaJobTransition("ready", "running")).toThrow();
  });
  it("filters only server-confirmed configured models by media capability", () => {
    const found = listEligibleBuildMediaProviders({ request: { kind: "image", mode: "draft", referenceAssetIds: [] }, capabilities, availability });
    expect(found.map(x => x.modelId)).toEqual(["image/edit", "image/fast"]);
    expect(listEligibleBuildMediaProviders({ request: { kind: "video", mode: "final", referenceAssetIds: [] }, capabilities, availability })).toEqual([]);
  });
  it("uses real reference-asset capability, not application keywords", () => {
    const found = listEligibleBuildMediaProviders({ request: { kind: "image", mode: "draft", referenceAssetIds: [assetId] }, capabilities, availability });
    expect(found.map(x => x.modelId)).toEqual(["image/edit"]);
  });
  it("rejects duplicate and untrusted provider metadata", () => {
    expect(() => listEligibleBuildMediaProviders({ request: { kind: "image", mode: "draft", referenceAssetIds: [] }, capabilities: [...capabilities, capabilities[0]], availability })).toThrow();
    expect(() => listEligibleBuildMediaProviders({ request: { kind: "image", mode: "draft", referenceAssetIds: [] }, capabilities, availability: [...availability, availability[0]] })).toThrow();
    expect(() => listEligibleBuildMediaProviders({ request: { kind: "image", mode: "draft", referenceAssetIds: [] }, capabilities, availability: [{ providerId: "image-service", modelId: "image/fast", configured: true, measuredP95Ms: -3 }] })).toThrow();
  });
});
