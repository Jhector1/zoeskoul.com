import { describe, expect, it } from "vitest";
import type { FSNode, FileNode } from "../types";
import {
    isLearnerHiddenWorkspacePath,
    learnerVisibleTabFiles,
    learnerVisibleWorkspaceNodes,
    resolveLearnerWorkspacePresentation,
} from "./workspacePresentation";

const nodes: FSNode[] = [
    { id: "internal", kind: "folder", name: ".zoeskoul", parentId: null, createdAt: 0, updatedAt: 0 },
    { id: "setup", kind: "file", name: "setup.sh", parentId: "internal", content: "echo setup\n", createdAt: 0, updatedAt: 0 },
    { id: "repo", kind: "folder", name: "trail-journal", parentId: null, createdAt: 0, updatedAt: 0 },
    { id: "readme", kind: "file", name: "README.md", parentId: "repo", content: "# Trail Journal\n", createdAt: 0, updatedAt: 0 },
    { id: "git", kind: "folder", name: ".git", parentId: "repo", createdAt: 0, updatedAt: 0 },
    { id: "head", kind: "file", name: "HEAD", parentId: "git", content: "ref: refs/heads/main\n", createdAt: 0, updatedAt: 0 },
    { id: "ignore", kind: "file", name: ".gitignore", parentId: "repo", content: "dist/\n", createdAt: 0, updatedAt: 0 },
];

const files = nodes.filter((node): node is FileNode => node.kind === "file");

describe("workspacePresentation", () => {
    it("hides platform bootstrap and Git metadata without hiding .gitignore", () => {
        expect(isLearnerHiddenWorkspacePath(".zoeskoul/setup.sh")).toBe(true);
        expect(isLearnerHiddenWorkspacePath("trail-journal/.git/HEAD")).toBe(true);
        expect(isLearnerHiddenWorkspacePath("trail-journal/.gitignore")).toBe(false);

        expect(learnerVisibleWorkspaceNodes(nodes).map((node) => node.id)).toEqual([
            "repo",
            "readme",
            "ignore",
        ]);
    });

    it("removes internal files from editor tabs while keeping them in runtime nodes", () => {
        expect(learnerVisibleTabFiles(nodes, files).map((file) => file.id)).toEqual([
            "readme",
            "ignore",
        ]);
        expect(nodes.some((node) => node.id === "setup")).toBe(true);
        expect(nodes.some((node) => node.id === "head")).toBe(true);
    });

    it("resolves hidden active and entry files to a visible learner file synchronously", () => {
        expect(
            resolveLearnerWorkspacePresentation({
                nodes,
                tabFiles: [files.find((file) => file.id === "setup")!],
                activeFileId: "setup",
                entryFileId: "setup",
            }),
        ).toMatchObject({
            activeFileId: "readme",
            entryFileId: "readme",
            activeFile: { id: "readme", name: "README.md" },
            entryFile: { id: "readme", name: "README.md" },
            tabFiles: [{ id: "readme", name: "README.md" }],
        });
    });

    it("drops blank or orphaned nodes before building Explorer rows and selection", () => {
        const malformedNodes: FSNode[] = [
            ...nodes,
            { id: "blank", kind: "file", name: "", parentId: "repo", content: "", createdAt: 0, updatedAt: 0 },
            { id: "blank-folder", kind: "folder", name: " ", parentId: null, createdAt: 0, updatedAt: 0 },
            { id: "blank-child", kind: "file", name: "leak.txt", parentId: "blank-folder", content: "", createdAt: 0, updatedAt: 0 },
            { id: "orphan", kind: "file", name: "orphan.txt", parentId: "missing", content: "", createdAt: 0, updatedAt: 0 },
            { id: "cycle-a", kind: "folder", name: "cycle-a", parentId: "cycle-b", createdAt: 0, updatedAt: 0 },
            { id: "cycle-b", kind: "folder", name: "cycle-b", parentId: "cycle-a", createdAt: 0, updatedAt: 0 },
        ];

        const presentation = resolveLearnerWorkspacePresentation({
            nodes: malformedNodes,
            tabFiles: malformedNodes.filter(
                (node): node is FileNode => node.kind === "file",
            ),
            activeFileId: "blank",
            entryFileId: "blank",
        });

        expect(presentation.nodes.map((node) => node.id)).not.toEqual(
            expect.arrayContaining([
                "blank",
                "blank-folder",
                "blank-child",
                "orphan",
                "cycle-a",
                "cycle-b",
            ]),
        );
        expect(presentation.activeFileId).toBe("readme");
        expect(presentation.entryFileId).toBe("readme");
    });
});
