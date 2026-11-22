import {describe, expect, it} from "vitest";
import {approvedDraftAdminQaSelection, matchesDraftAdminQaLocation} from "./adminLabQaClientSelection";

const prefix = "catalog=linux&subject=linux&moduleDir=linux-module-3-users-groups-troubleshooting&topicDir=";

describe("draft administrator QA follows the visible topic", () => {
  it("shows QA for precisely approved Course 2 draft topics", () => {
    expect(approvedDraftAdminQaSelection(prefix + "sudo-root-concepts")?.topic).toBe("sudo-root-concepts");
    expect(approvedDraftAdminQaSelection(prefix + "ownership-administration-concepts")?.topic).toBe("ownership-administration-concepts");
    expect(approvedDraftAdminQaSelection(
      "catalog=linux&subject=linux&moduleDir=linux-module-4-secure-project-capstone&topicDir=final-capstone-secure-project"
    )?.topic).toBe("final-capstone-secure-project");
  });
  it("hides QA when navigating to a normal owner/group lesson", () => {
    expect(approvedDraftAdminQaSelection(prefix + "owner-group-identity")).toBeNull();
    expect(approvedDraftAdminQaSelection(prefix + "sudo-root-concepts&subject=other")).toBeNull();
    expect(approvedDraftAdminQaSelection(prefix + "permissions-basics")).toBeNull();
  });
  it("rejects duplicate identity query parameters even when the first value is approved", () => {
    const valid = prefix + "sudo-root-concepts";
    for (const duplicate of [
      "&subject=other", "&subject=linux",
      "&catalog=other", "&catalog=linux",
      "&moduleDir=other", "&moduleDir=linux-module-3-users-groups-troubleshooting",
      "&topicDir=owner-group-identity", "&topicDir=sudo-root-concepts",
    ]) {
      expect(approvedDraftAdminQaSelection(valid + duplicate)).toBeNull();
    }
    expect(approvedDraftAdminQaSelection(valid + "&preview=1")?.topic).toBe("sudo-root-concepts");
  });
  it("rejects stale panels after navigation, including approved-to-approved transitions", () => {
    const active = approvedDraftAdminQaSelection(prefix + "sudo-root-concepts");
    expect(active).not.toBeNull();
    if (!active) return;
    expect(matchesDraftAdminQaLocation("?" + prefix + "sudo-root-concepts", active)).toBe(true);
    expect(matchesDraftAdminQaLocation("?" + prefix + "owner-group-identity", active)).toBe(false);
    expect(matchesDraftAdminQaLocation("?" + prefix + "ownership-administration-concepts", active)).toBe(false);
  });
});
