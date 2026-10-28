import { describe, expect, it } from "vitest";
import { PreviewProjectDrainRegistry } from "./reactPreviewProjectDrainPolicy.js";

describe("runner project-scoped preview drain", () => {
  it("blocks drain during in-flight startup, then blocks new starts", () => {
    const registry = new PreviewProjectDrainRegistry();
    const finish = registry.beginStart("actor", "project");
    expect(() => registry.beginDrain("actor", "project")).toThrow("startup in progress");
    finish(); finish();
    const id = registry.beginDrain("actor", "project");
    expect(() => registry.beginStart("actor", "project")).toThrow("deletion in progress");
    expect(() => registry.beginDrain("actor", "project")).toThrow("already in progress");
    expect(registry.releaseDrain("actor", "project", "wrong-token")).toBe(false);
    expect(registry.releaseDrain("actor", "project", id)).toBe(true);
    registry.beginStart("actor", "project")();
  });
  it("cannot drain or release another owner's project", () => {
    const registry = new PreviewProjectDrainRegistry();
    const id = registry.beginDrain("alice", "project");
    registry.beginStart("bob", "project")();
    registry.beginStart("alice", "other-project")();
    expect(registry.releaseDrain("bob", "project", id)).toBe(false);
    expect(registry.releaseDrain("alice", "project", id)).toBe(true);
  });
  it("rejects empty identity and cannot double-decrement", () => {
    const registry = new PreviewProjectDrainRegistry();
    expect(() => registry.beginDrain("", "project")).toThrow("Forbidden");
    const release = registry.beginStart("owner", "project");
    release();release();
    const id = registry.beginDrain("owner", "project");
    expect(registry.releaseDrain("owner", "project", id)).toBe(true);
  });
});
