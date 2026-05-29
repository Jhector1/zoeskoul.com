import { describe, expect, it } from "vitest";

import { relativeProjectPathOf } from "./fsTree";

describe("relativeProjectPathOf", () => {
    it("preserves top-level folders when there is no synthetic project root", () => {
        const nodes = [
            {
                id: "folder:data",
                kind: "folder" as const,
                name: "data",
                parentId: null,
                createdAt: 0,
                updatedAt: 0,
            },
            {
                id: "file:message",
                kind: "file" as const,
                name: "message.txt",
                parentId: "folder:data",
                content: "hello",
                createdAt: 0,
                updatedAt: 0,
            },
        ];

        expect(relativeProjectPathOf(nodes, "file:message")).toBe("data/message.txt");
    });

    it("still strips the synthetic src root when one exists", () => {
        const nodes = [
            {
                id: "folder:src",
                kind: "folder" as const,
                name: "src",
                parentId: null,
                createdAt: 0,
                updatedAt: 0,
            },
            {
                id: "folder:data",
                kind: "folder" as const,
                name: "data",
                parentId: "folder:src",
                createdAt: 0,
                updatedAt: 0,
            },
            {
                id: "file:message",
                kind: "file" as const,
                name: "message.txt",
                parentId: "folder:data",
                content: "hello",
                createdAt: 0,
                updatedAt: 0,
            },
        ];

        expect(relativeProjectPathOf(nodes, "file:message")).toBe("data/message.txt");
    });
});
