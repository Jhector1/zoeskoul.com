import { describe, expect, it } from "vitest";

import {
  getTutoringBaselineVersion,
  mergeTutoringSnapshotValue,
  withTutoringBaseline,
} from "./sessionWorkspaceMerge";

describe("tutoring workspace snapshot merge", () => {
  it("applies tutor changes to untouched values and preserves learner conflicts", () => {
    const base = {
      title: "Lesson v1",
      workspace: {
        version: 2,
        nodes: [
          { id: "main", kind: "file", name: "main.py", content: "print('v1')" },
        ],
      },
    };
    const incoming = {
      title: "Lesson v2",
      workspace: {
        version: 2,
        nodes: [
          { id: "main", kind: "file", name: "main.py", content: "print('tutor v2')" },
          { id: "tests", kind: "file", name: "test_main.py", content: "assert True" },
        ],
      },
    };
    const learner = {
      title: "Lesson v1",
      workspace: {
        version: 2,
        nodes: [
          { id: "main", kind: "file", name: "main.py", content: "print('learner')" },
        ],
      },
    };

    expect(mergeTutoringSnapshotValue(base, incoming, learner)).toEqual({
      title: "Lesson v2",
      workspace: {
        version: 2,
        nodes: [
          { id: "main", kind: "file", name: "main.py", content: "print('learner')" },
          { id: "tests", kind: "file", name: "test_main.py", content: "assert True" },
        ],
      },
    });
  });

  it("stores the applied reference version without changing other state", () => {
    const value = withTutoringBaseline({ topics: { one: { completed: true } } }, 4);
    expect(getTutoringBaselineVersion(value)).toBe(4);
    expect(value.topics.one.completed).toBe(true);
  });
  it("merges the first published tutor snapshot when no historical baseline document exists", () => {
    const incoming = {
      runtimeStateV2: {
        exercises: {
          ex1: {
            workspace: {
              version: 2,
              nodes: [
                { id: "main", kind: "file", name: "main.py", content: "tutor update" },
                { id: "test", kind: "file", name: "test_main.py", content: "new test" },
              ],
            },
          },
        },
      },
    };
    const current = {
      runtimeStateV2: {
        exercises: {
          ex1: {
            workspace: {
              version: 2,
              nodes: [
                { id: "main", kind: "file", name: "main.py", content: "learner work" },
                { id: "notes", kind: "file", name: "notes.txt", content: "keep me" },
              ],
            },
          },
        },
      },
    };

    const merged = mergeTutoringSnapshotValue(undefined, incoming, current) as any;
    const files = merged.runtimeStateV2.exercises.ex1.workspace.nodes;

    expect(files.find((file: any) => file.id === "main")?.content).toBe("learner work");
    expect(files.find((file: any) => file.id === "test")?.content).toBe("new test");
    expect(files.find((file: any) => file.id === "notes")?.content).toBe("keep me");
  });

});
