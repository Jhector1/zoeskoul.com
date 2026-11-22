import { describe, expect, it } from "vitest";
import type { ReviewModule } from "@zoeskoul/curriculum-contracts/subjects/types";
import { canonicalDraftQaPreviewRoute, selectedDraftQaFirstTopicId } from "./draftPreviewCanonicalRoute";

const owner = {
  id: "owner-group-identity",
  slug: "owner-group-identity",
  draftTopicDir: "owner-group-identity",
  cards: [{ type: "text", id: "owner-intro" }],
};
const sudo = {
  id: "sudo-root-concepts",
  slug: "sudo-root-concepts",
  draftTopicDir: "sudo-root-concepts",
  cards: [{ type: "text", id: "sudo-intro" }],
};
const mod = {
  id: "linux-module-3-users-groups-troubleshooting",
  title: "Linux Users and Groups",
  startPracticeSectionSlug: "linux-module-3-least-privilege",
  topics: [owner, sudo],
  sections: [{
    id: "linux-module-3-least-privilege",
    slug: "linux-module-3-least-privilege",
    title: "Least Privilege",
    order: 1,
    topics: [owner, sudo],
  }],
} as unknown as ReviewModule;

const route = {
  sectionSlug: "linux-module-3-least-privilege",
  topicSlug: "sudo-root-concepts",
  targetKind: "quiz",
  targetSlug: "quiz",
};

const base = {
  mod,
  topicDir: "sudo-root-concepts",
  subjectSlug: "linux",
  moduleSlug: "linux-module-3-users-groups-troubleshooting",
};

describe("Draft QA canonical preview route", () => {
  it("recovers from the stale sudo-root quiz route without displaying owner-group-identity", () => {
    const resolved = canonicalDraftQaPreviewRoute({ ...base, requested: route });
    expect(resolved.status).toBe("redirect");
    if (resolved.status !== "redirect") return;
    expect(resolved.target.topicId).toBe("sudo-root-concepts");
    expect(resolved.target.topicSlug).toBe("sudo-root-concepts");
    expect(resolved.target.targetSlug).toBe("sudo-intro");
  });

  it("does not accept a valid owner-group route for the selected sudo-root draft", () => {
    const resolved = canonicalDraftQaPreviewRoute({
      ...base,
      requested: {
        sectionSlug: "linux-module-3-least-privilege",
        topicSlug: "owner-group-identity",
        targetKind: "card",
        targetSlug: "owner-intro",
      },
    });
    expect(resolved.status).toBe("redirect");
    if (resolved.status === "redirect") {
      expect(resolved.target.topicId).toBe("sudo-root-concepts");
    }
  });

  it("preserves valid canonical routes for the selected topic", () => {
    const recovery = canonicalDraftQaPreviewRoute({ ...base, requested: route });
    expect(recovery.status).toBe("redirect");
    if (recovery.status !== "redirect") return;
    const result = canonicalDraftQaPreviewRoute({
      ...base,
      requested: {
        sectionSlug: recovery.target.sectionSlug,
        topicSlug: recovery.target.topicSlug,
        targetKind: recovery.target.targetKind,
        targetSlug: recovery.target.targetSlug,
      },
    });
    expect(result).toEqual({ status: "ready" });
  });

  it("uses the editor-selected topic as Draft QA's initial progress topic", () => {
    expect(selectedDraftQaFirstTopicId(mod, "sudo-root-concepts")).toBe("sudo-root-concepts");
    expect(selectedDraftQaFirstTopicId(mod, "owner-group-identity")).toBe("owner-group-identity");
    expect(selectedDraftQaFirstTopicId(mod, "not-in-draft")).toBeNull();
    expect(selectedDraftQaFirstTopicId({ ...mod, topics: [sudo, sudo] } as unknown as ReviewModule, "sudo-root-concepts")).toBeNull();
  });

  it("fails closed for missing, ambiguous, or empty draft topics", () => {
    expect(canonicalDraftQaPreviewRoute({
      ...base, topicDir: "not-a-topic", requested: route,
    }).status).toBe("invalid");
    expect(canonicalDraftQaPreviewRoute({
      ...base, mod: { ...mod, topics: [sudo, sudo] } as unknown as ReviewModule,
      requested: route,
    }).status).toBe("invalid");
    expect(canonicalDraftQaPreviewRoute({
      ...base, mod: { ...mod, topics: [{ ...sudo, cards: [] }] } as unknown as ReviewModule,
      requested: route,
    }).status).toBe("invalid");
  });
});
