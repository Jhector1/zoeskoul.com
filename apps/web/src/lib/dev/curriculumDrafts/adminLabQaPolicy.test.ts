import { describe, expect, it } from "vitest";
import { hasOnlyAdminFilesystemStrategy, parseDraftAdminLabRef } from "./adminLabQaPolicy";

const approved = {
  catalog: "linux", subject: "linux",
  module: "linux-module-3-users-groups-troubleshooting", topic: "sudo-root-concepts",
};

describe("draft-only administrator QA boundary", () => {
  it("recognizes only the exact manually approved Course 2 source identity", () => {
    expect(parseDraftAdminLabRef(approved)).toMatchObject(approved);
    expect(parseDraftAdminLabRef({...approved, catalog: "web"})).toBeNull();
    expect(parseDraftAdminLabRef({...approved, subject: "linux-files-permissions-users"})).toBeNull();
    expect(parseDraftAdminLabRef({...approved, module: "linux-module-1-permission-fundamentals"})).toBeNull();
    expect(parseDraftAdminLabRef({...approved, topic: "permission-denied-triage"})).toBeNull();
    expect(parseDraftAdminLabRef({...approved, locale: "fr"})).toBeNull();
    expect(parseDraftAdminLabRef({...approved, extra: "true"})).toBeNull();
    expect(parseDraftAdminLabRef(null)).toBeNull();
  });
  it("allows the other two precisely approved topic/module pairs", () => {
    expect(parseDraftAdminLabRef({...approved, topic: "ownership-administration-concepts"})).not.toBeNull();
    expect(parseDraftAdminLabRef({...approved, module: "linux-module-4-secure-project-capstone", topic: "final-capstone-secure-project"})).not.toBeNull();
  });
  it("rejects browser-style or mixed grading evidence", () => {
    const adminLabFilesystemExpectations = {required: [{path:"/workspace/protected.txt",kind:"file",mode:"0640"}]};
    expect(hasOnlyAdminFilesystemStrategy({adminLabFilesystemExpectations})).toBe(true);
    expect(hasOnlyAdminFilesystemStrategy({adminLabFilesystemExpectations, terminalExpectations: []})).toBe(false);
    expect(hasOnlyAdminFilesystemStrategy({adminLabFilesystemExpectations, tests:[{stdout:"passed"}]})).toBe(false);
    expect(hasOnlyAdminFilesystemStrategy({terminalExpectations: []})).toBe(false);
    expect(hasOnlyAdminFilesystemStrategy(null)).toBe(false);
  });
});
