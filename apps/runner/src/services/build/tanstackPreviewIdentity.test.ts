import { describe, expect, it } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";

const image = `sha256:${"a".repeat(64)}`;
function request(files?: ProductionBuildJobRequestV1["files"]): ProductionBuildJobRequestV1 {
  return {
    protocolVersion: 1,
    operation: "production-build",
    buildProjectId: "project-a",
    sourceVersion: 4,
    stackId: "tanstack-start-v1",
    templateId: "tanstack-start-v1",
    files: files ?? [
      {path:"package.json",content:"{}"},
      {path:"pnpm-lock.yaml",content:"lock"},
      {path:"zoebuild-dependency-approval.json",content:"approval"},
      {path:"src/main.tsx",content:"export default 1"},
    ],
  };
}

describe("TanStack preview identity", () => {
  it("is stable across file order while binding exact source, dependencies and image", () => {
    const original = request();
    const reordered = request([...original.files].reverse());
    expect(createTanstackPreviewIdentity(original,image)).toEqual(
      createTanstackPreviewIdentity(reordered,image));

    const changedSource = request(original.files.map(file => file.path === "src/main.tsx"
      ? {...file,content:"export default 2"} : file));
    const changedLock = request(original.files.map(file => file.path === "pnpm-lock.yaml"
      ? {...file,content:"different-lock"} : file));
    expect(createTanstackPreviewIdentity(changedSource,image).sourceFingerprint)
      .not.toBe(createTanstackPreviewIdentity(original,image).sourceFingerprint);
    expect(createTanstackPreviewIdentity(changedLock,image).dependencyFingerprint)
      .not.toBe(createTanstackPreviewIdentity(original,image).dependencyFingerprint);
    expect(createTanstackPreviewIdentity(original,`sha256:${"b".repeat(64)}`).fingerprint)
      .not.toBe(createTanstackPreviewIdentity(original,image).fingerprint);
  });

  it("rejects mutable images and incomplete dependency identity", () => {
    expect(() => createTanstackPreviewIdentity(request(),"runtime:latest")).toThrow("immutable");
    expect(() => createTanstackPreviewIdentity(request(request().files.filter(
      file => file.path !== "zoebuild-dependency-approval.json")),image)).toThrow("incomplete");
  });
});
