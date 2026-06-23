import { describe, expect, it } from "vitest";
import {
    replaceEntryFileContent,
    serializeWorkspaceForCodeRun,
} from "@/lib/code/workspaceSubmission";
import type { WorkspaceStateV2 } from "@/components/ide/types";

function makeWorkspace(): WorkspaceStateV2 {
    return {
        version: 2,
        language: "cpp",
        activeFileId: "main",
        entryFileId: "main",
        openTabs: ["main"],
        expanded: ["src"],
        leftPct: 26,
        stdin: "",
        nodes: [
            {
                id: "src",
                kind: "folder",
                name: "src",
                parentId: null,
                createdAt: 0,
                updatedAt: 0,
            } as any,
            {
                id: "main",
                kind: "file",
                name: "main.cpp",
                parentId: "src",
                content: '#include <iostream>\n\nint main() {\n  std::cout << "Hello from C++!" << std::endl;\n  return 0;\n}\n',
                createdAt: 0,
                updatedAt: 0,
            } as any,
            {
                id: "helper",
                kind: "file",
                name: "helper.txt",
                parentId: "src",
                content: "helper\n",
                createdAt: 0,
                updatedAt: 0,
            } as any,
        ],
    };
}

describe("workspaceSubmission", () => {
    it("can replace the active entry file content without losing sibling files", () => {
        const workspace = makeWorkspace();
        const submission = serializeWorkspaceForCodeRun(workspace);

        expect(submission).not.toBeNull();

        const editedCode = `#include <iostream>
int main() {
    std::cout << "serialized latest\\n";
    return 0;
}
`;

        const files = replaceEntryFileContent({
            entry: submission!.entry,
            files: submission!.files,
            content: editedCode,
        });

        expect(submission!.entry).toBe("src/main.cpp");
        expect(files).toEqual(
            expect.arrayContaining([
                { path: "src/main.cpp", content: editedCode },
                { path: "src/helper.txt", content: "helper\n" },
            ]),
        );
    });
});
