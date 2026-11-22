import {describe, expect, it} from "vitest";
import {AUTHOR_ONLY_QA_TOPIC_MODULES, authorOnlyAdminQaKey, parseAuthorOnlyAdminQaKey,
  parseAuthorOnlyAdminQaContract} from "./adminLabQaAuthoringPure";

function valid() {
  return {version:1, purpose:"draft-admin-lab-qa-only", topicSlug:"sudo-root-concepts",
    exercises:[{id:"sudo-qa-root-file", title:"Verify a root-owned file",
      instructions:"Inside the disposable workspace only, create and configure /workspace/qa-sudo/root.txt.",
      expected:{required:[{path:"/workspace/qa-sudo/root.txt",kind:"file",mode:"0640",uid:0,gid:0}]}}]};
}

describe("author-only Course 2 administrator QA contracts", () => {
  it("accepts a strict private filesystem contract", () => {
    expect(parseAuthorOnlyAdminQaContract(valid(), "sudo-root-concepts").exercises[0].expected.required[0].uid).toBe(0);
  });
  it("rejects cross-topic, unexpected fields, and duplicate author QA ids", () => {
    expect(() => parseAuthorOnlyAdminQaContract(valid(), "ownership-administration-concepts")).toThrow();
    expect(() => parseAuthorOnlyAdminQaContract({...valid(), unexpected:true}, "sudo-root-concepts")).toThrow();
    const duplicate = valid(); duplicate.exercises.push({...duplicate.exercises[0]});
    expect(() => parseAuthorOnlyAdminQaContract(duplicate, "sudo-root-concepts")).toThrow();
  });
  it("rejects unsafe, symlink-style and ambiguous filesystem expectations", () => {
    for (const path of ["/etc/shadow", "/workspace/../etc/passwd", "/workspace/foo//bar"]) {
      const invalid=valid(); invalid.exercises[0].expected.required[0].path=path;
      expect(() => parseAuthorOnlyAdminQaContract(invalid, "sudo-root-concepts")).toThrow();
    }
    const invalid=valid(); invalid.exercises[0].expected.required[0].uid=-1;
    expect(() => parseAuthorOnlyAdminQaContract(invalid, "sudo-root-concepts")).toThrow();
  });
  it("requires exact, allowlisted, unambiguous author-only selectors", () => {
    const key=authorOnlyAdminQaKey("sudo-root-concepts","sudo-qa-root-file");
    expect(parseAuthorOnlyAdminQaKey(key)).toEqual({topic:"sudo-root-concepts",id:"sudo-qa-root-file",
      module:AUTHOR_ONLY_QA_TOPIC_MODULES["sudo-root-concepts"]});
    for (const bad of [key+".extra", key.replace("sudo-root-concepts","owner-group-identity"),
      key.replace("sudo-qa-root-file","../etc"),"draftqa.some-legacy-key"]) {
      expect(parseAuthorOnlyAdminQaKey(bad)).toBeNull();
    }
  });
});
