import { describe, expect, it } from "vitest";
import { resolveScopedAdminTerminal } from "./resolveScopedAdminTerminal";

const moduleSlug = "linux-module-3-users-groups-troubleshooting";
const topicSlug = "sudo-root-concepts";
const base = { subjectSlug: "linux-files-permissions-users", moduleSlug, topicSlug, draftQaMode: false };

describe("single-pane administrator sandbox presentation", () => {
  it("selects a student administrator pane only for exact allowlisted, manifest-eligible target", () => {
    expect(resolveScopedAdminTerminal({ ...base, ideConfig: {administratorLab: "eligible"} })).toEqual({
      kind: "student", target: {moduleSlug, topicSlug},
    });
  });
  it("does not grant another Linux lesson or unmarked topic a privileged pane", () => {
    for (const changed of [
      { topicSlug: "permission-bits" },
      { moduleSlug: "linux-module-1-permission-fundamentals" },
      { subjectSlug: "linux-terminal-fundamentals" },
      { ideConfig: {administratorLab: "disabled"} as const },
    ]) expect(resolveScopedAdminTerminal({ ...base, ideConfig: {administratorLab: "eligible"}, ...changed }).kind).toBe("ordinary");
  });
  it("never uses a client manifest flag to override draft QA location", () => {
    expect(resolveScopedAdminTerminal({
      ...base, draftQaMode: true, ideConfig: {administratorLab: "eligible"},
      draftSelection: {catalog: "linux", subject: "linux", module: moduleSlug, topic: "ownership-administration-concepts"},
    }).kind).toBe("ordinary");
  });
  it("chooses the approved draft QA pane for the exact selected lesson", () => {
    expect(resolveScopedAdminTerminal({
      ...base, draftQaMode: true,
      draftSelection: {catalog: "linux", subject: "linux", module: moduleSlug, topic: topicSlug},
    })).toEqual({kind: "draft", draft: {catalog: "linux", subject: "linux", module: moduleSlug, topic: topicSlug}});
  });
  it("never selects a student pane from draft metadata", () => {
    expect(resolveScopedAdminTerminal({...base, draftQaMode: true, ideConfig:{administratorLab:"eligible"}}).kind).toBe("ordinary");
  });
});
