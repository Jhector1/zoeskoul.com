import { describe, expect, it } from "vitest";

import {
  estimateWorkspaceUsage,
} from "./workspacePolicy";
import type { FSNode } from "@zoeskoul/learner-workspace/ide/types";

describe("workspace usage accounting", () => {
  it("adds file bytes once instead of compounding the prior sum", () => {
    const nodes: FSNode[] = [
      {
        id: "a",
        kind: "file",
        name: "a.txt",
        parentId: null,
        content: "1234567890",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "b",
        kind: "file",
        name: "b.txt",
        parentId: null,
        content: "12345678901234567890",
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    expect(estimateWorkspaceUsage(nodes)).toMatchObject({
      fileCount: 2,
      nodeCount: 2,
      totalBytes: 30,
    });
  });
});
