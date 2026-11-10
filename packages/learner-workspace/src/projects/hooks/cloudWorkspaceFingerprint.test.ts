import { describe, expect, it } from "vitest";
import { cloudWorkspaceFingerprint } from "./cloudWorkspaceFingerprint";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

function project(): WorkspaceStateV2 {
    return {
        version: 2,
        language: "python",
        nodes: [
            {id: "folder", kind: "folder", name: "src", parentId: null, createdAt: 1, updatedAt: 1},
            {id: "f1", kind: "file", name: "main.py", parentId: "folder", content: "print(1)", createdAt: 1, updatedAt: 1},
            {id: "f2", kind: "file", name: "other.py", parentId: "folder", content: "", createdAt: 1, updatedAt: 1},
        ],
        openTabs: ["f1"], activeFileId: "f1", entryFileId: "f1",
        expanded: ["folder"], leftPct: 26, stdin: "",
    };
}

describe("semantic cloud dirty baseline", () => {
    it("treats a fetched workspace with normalized editor layout as clean", () => {
        const remote = project();
        const applied = {...remote, openTabs: ["f2", "f1"], activeFileId: "f2", expanded: [], leftPct: 40};
        expect(cloudWorkspaceFingerprint(applied)).toBe(cloudWorkspaceFingerprint(remote));
    });
    it("does not dirty a project for reordered nodes or file timestamps", () => {
        const remote = project();
        const applied = {...remote, nodes: [...remote.nodes].reverse().map(n => ({...n, updatedAt: 22, createdAt: 20}))};
        expect(cloudWorkspaceFingerprint(applied)).toBe(cloudWorkspaceFingerprint(remote));
    });
    it("detects text content edits", () => {
        const remote = project();
        const changed = {...remote, nodes: remote.nodes.map(n => n.kind === "file" && n.id === "f1" ? {...n, content: "print(2)"} : n)};
        expect(cloudWorkspaceFingerprint(changed)).not.toBe(cloudWorkspaceFingerprint(remote));
    });
    it("detects renames and moved files", () => {
        const remote = project();
        const renamed = {...remote, nodes: remote.nodes.map(n => n.id === "f1" ? {...n, name: "new.py"} : n)};
        expect(cloudWorkspaceFingerprint(renamed)).not.toBe(cloudWorkspaceFingerprint(remote));
    });
    it("detects changing the executable entry and stdin", () => {
        const remote = project();
        expect(cloudWorkspaceFingerprint({...remote, entryFileId: "f2"})).not.toBe(cloudWorkspaceFingerprint(remote));
        expect(cloudWorkspaceFingerprint({...remote, stdin: "hello"})).not.toBe(cloudWorkspaceFingerprint(remote));
    });
    it("detects adding and deleting files", () => {
        const remote = project();
        expect(cloudWorkspaceFingerprint({...remote, nodes: remote.nodes.slice(0, 2)})).not.toBe(cloudWorkspaceFingerprint(remote));
    });
    it("survives complete node-ID regeneration after browser refresh", () => {
        const original = project();
        const rebuilt = {
            ...original,
            nodes: original.nodes.map((node) => ({
                ...node,
                id: node.id === "folder" ? "new-folder-id" : `fresh-${node.id}`,
                parentId: node.parentId === "folder" ? "new-folder-id" : null,
            })),
            entryFileId: "fresh-f1",
            activeFileId: "fresh-f2",
            openTabs: ["fresh-f2"],
            expanded: ["new-folder-id"],
        };
        expect(cloudWorkspaceFingerprint(rebuilt)).toBe(cloudWorkspaceFingerprint(original));
    });
    it("detects different content even if node IDs are rebuilt", () => {
        const original = project();
        const rebuilt = {
            ...original,
            nodes: original.nodes.map((node) => ({
                ...node,
                id: node.id === "folder" ? "new-folder-id" : `fresh-${node.id}`,
                parentId: node.parentId === "folder" ? "new-folder-id" : null,
                ...(node.kind === "file" && node.name === "main.py" ? {content: "changed"} : {}),
            })),
            entryFileId: "fresh-f1",
        };
        expect(cloudWorkspaceFingerprint(rebuilt)).not.toBe(cloudWorkspaceFingerprint(original));
    });
    it("detects an entry-file change by path after ID regeneration", () => {
        const original = project();
        const rebuilt = {
            ...original,
            nodes: original.nodes.map((node) => ({...node, id: `next-${node.id}`,
                parentId: node.parentId === "folder" ? "next-folder" : null})),
            entryFileId: "next-f2",
        };
        expect(cloudWorkspaceFingerprint(rebuilt)).not.toBe(cloudWorkspaceFingerprint(original));
    });
    it("treats invalid parent chains and duplicate paths as unverified", () => {
        const missingParent = {...project(), nodes: project().nodes.map(n => n.id === "f1" ? {...n, parentId: "missing"} : n)};
        const duplicatedPath = {...project(), nodes: project().nodes.map(n => n.id === "f2" ? {...n, name: "main.py"} : n)};
        expect(cloudWorkspaceFingerprint(missingParent)).toMatch(/^invalid-cloud-workspace:/);
        expect(cloudWorkspaceFingerprint(duplicatedPath)).toMatch(/^invalid-cloud-workspace:/);
    });
    it("detects binary content changes", () => {
        const remote = project();
        const binary = {encoding: "base64" as const, data: "AQ==", sizeBytes: 1, mimeType: "image/png"};
        const one = {...remote, nodes: remote.nodes.map(n => n.kind === "file" && n.id === "f1" ? {...n, content: "", binary} : n)};
        const two = {...remote, nodes: one.nodes.map(n => n.kind === "file" && n.id === "f1" ? {...n, binary: {...binary, data: "Ag=="}} : n)};
        expect(cloudWorkspaceFingerprint(one)).not.toBe(cloudWorkspaceFingerprint(remote));
        expect(cloudWorkspaceFingerprint(two)).not.toBe(cloudWorkspaceFingerprint(one));
    });
});
