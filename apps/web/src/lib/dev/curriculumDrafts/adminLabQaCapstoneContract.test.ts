import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {parseAuthorOnlyAdminQaContract, authorOnlyAdminQaKey,
  parseAuthorOnlyAdminQaKey} from "./adminLabQaAuthoringPure";

// The author QA route loads the canonical authoring contract on the server.
// The .curriculum-drafts/manual-qa copy is a review-only reference, not a second grader.
const CONTRACT_PATH = fileURLToPath(new URL(
  "../../../../../../authoring/subjects/linux/courses/linux-files-permissions-users/admin-lab-qa/final-capstone-secure-project.json",
  import.meta.url,
));
const project = "/workspace/secure-project";
const expectedRows = [
  [project, "directory", "0755", 1000, 1000],
  [`${project}/README.md`, "file", "0644", 0, 0],
  [`${project}/scripts`, "directory", "0700", 1000, 1000],
  [`${project}/scripts/run.sh`, "file", "0700", 1000, 1000],
  [`${project}/secrets.env`, "file", "0600", 1000, 1000],
  [`${project}/shared`, "directory", "0770", 1000, 1000],
  [`${project}/shared/notes.txt`, "file", "0640", 1000, 1000],
];

describe("Course 2 real capstone author QA contract", () => {
  it("binds all seven actual capstone paths, modes and owners", () => {
    const raw = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
    const parsed = parseAuthorOnlyAdminQaContract(raw, "final-capstone-secure-project");
    expect(parsed.exercises).toHaveLength(1);
    expect(parsed.exercises[0].id).toBe("capstone-qa-minimal-modes");
    const rows = parsed.exercises[0].expected.required.map(
      (r) => [r.path, r.kind, r.mode, r.uid, r.gid],
    );
    expect(rows).toEqual(expectedRows);
    expect(rows.some((r) => String(r[0]).includes("qa-secure-project"))).toBe(false);
    expect(parsed.exercises[0].instructions).toContain("SAME active administrator sandbox");
  });
  it("retains the stable author-only selector and topic isolation", () => {
    const key = authorOnlyAdminQaKey("final-capstone-secure-project", "capstone-qa-minimal-modes");
    expect(parseAuthorOnlyAdminQaKey(key)).toEqual({
      topic: "final-capstone-secure-project",
      id: "capstone-qa-minimal-modes",
      module: "linux-module-4-secure-project-capstone",
    });
    const raw = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
    expect(() => parseAuthorOnlyAdminQaContract(raw, "sudo-root-concepts")).toThrow();
  });
});
