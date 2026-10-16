import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const explorer = readFileSync(
    resolve(
        process.cwd(),
        "packages/learner-workspace/src/fullide/ExplorerTree.tsx",
    ),
    "utf8",
);

describe("FullIDE Explorer hierarchy guide ownership", () => {
    it("aligns every indentation lane to the 28px folder chevron slot", () => {
        expect(explorer).toContain(
            'className="relative min-h-[36px] w-7 shrink-0 self-stretch"',
        );
        expect(explorer).toContain(
            '"grid h-7 w-7 place-items-center rounded-lg"',
        );
        expect(explorer).not.toContain('w-[14px]');
    });

    it("draws a Lovable-style branch from the parent guide into the child row", () => {
        expect(explorer).toContain(
            "const isBranch = i === depth - 1;",
        );
        expect(explorer).toContain(
            'data-tree-branch-guide="true"',
        );
        expect(explorer).toContain(
            "left-1/2 right-0 top-1/2 h-px",
        );
    });

    it("keeps vertical guides continuous across the existing 2px row gap", () => {
        expect(explorer).toContain(
            "absolute -inset-y-[2px] left-1/2 w-px",
        );
        expect(explorer).toContain(
            'data-tree-indent-guides="true"',
        );
    });
});
