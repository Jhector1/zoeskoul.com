import { describe, expect, it } from "vitest";

import {
    codeInputRegistrationKey,
    isSameCodeFeedback,
    reconcileProtectedCodeInputWorkspace,
    shouldNotifyCodeInputRegistry,
} from "./ReviewToolsContext";

describe("isSameCodeFeedback", () => {
    it("treats matching feedback payloads as equal", () => {
        expect(
            isSameCodeFeedback(
                {
                    area: "code",
                    source: "check",
                    kind: "logic",
                    tone: "warning",
                    title: "Not correct yet",
                    message: "Try again.",
                    line: 2,
                    column: 4,
                    raw: "raw output",
                },
                {
                    area: "code",
                    source: "check",
                    kind: "logic",
                    tone: "warning",
                    title: "Not correct yet",
                    message: "Try again.",
                    line: 2,
                    column: 4,
                    raw: "raw output",
                },
            ),
        ).toBe(true);
    });

    it("detects changed feedback content", () => {
        expect(
            isSameCodeFeedback(
                {
                    area: "code",
                    source: "check",
                    kind: "logic",
                    tone: "warning",
                    title: "Not correct yet",
                    message: "Try again.",
                },
                {
                    area: "code",
                    source: "check",
                    kind: "runtime",
                    tone: "danger",
                    title: "Runtime error",
                    message: "Boom",
                },
            ),
        ).toBe(false);
    });
});

describe("code input registration stability", () => {
    const makeWorkspace = (args: {
        activeFileId: string;
        openTabs: string[];
        schema: string;
        query: string;
    }) =>
        ({
            version: 2,
            language: "sql",
            entryFileId: "query",
            activeFileId: args.activeFileId,
            openTabs: args.openTabs,
            expanded: [],
            nodes: [
                {
                    id: "schema",
                    kind: "file",
                    name: "schema.sql",
                    parentId: null,
                    content: args.schema,
                },
                {
                    id: "query",
                    kind: "file",
                    name: "query.sql",
                    parentId: null,
                    content: args.query,
                },
            ],
        }) as any;

    const makeArgs = (workspace: any, exerciseKey = "exercise-1") =>
        ({
            exerciseKey,
            lang: "sql",
            code: "-- Write the verification query.\n",
            workspace,
            onPatch: () => undefined,
        }) as any;

    it("ignores view-only tab changes in the semantic registration key", () => {
        const schema = "CREATE TABLE orders (id INTEGER PRIMARY KEY);";
        const query = "-- Write the verification query.\n";

        const queryView = makeArgs(
            makeWorkspace({
                activeFileId: "query",
                openTabs: ["query", "schema"],
                schema,
                query,
            }),
        );
        const schemaView = makeArgs(
            makeWorkspace({
                activeFileId: "schema",
                openTabs: ["schema", "query"],
                schema,
                query,
            }),
        );

        expect(codeInputRegistrationKey(queryView)).toBe(
            codeInputRegistrationKey(schemaView),
        );
    });

    it("still detects real file-content changes", () => {
        const first = makeArgs(
            makeWorkspace({
                activeFileId: "query",
                openTabs: ["query", "schema"],
                schema:
                    "CREATE TABLE orders (id INTEGER PRIMARY KEY);",
                query: "-- Write the verification query.\n",
            }),
        );
        const edited = makeArgs(
            makeWorkspace({
                activeFileId: "query",
                openTabs: ["query", "schema"],
                schema:
                    "CREATE TABLE orders (id INTEGER PRIMARY KEY);",
                query: "SELECT sql FROM sqlite_master;\n",
            }),
        );

        expect(codeInputRegistrationKey(first)).not.toBe(
            codeInputRegistrationKey(edited),
        );
    });

    it("does not request a provider render for an existing same-target update", () => {
        const previous = makeArgs(
            makeWorkspace({
                activeFileId: "query",
                openTabs: ["query", "schema"],
                schema:
                    "CREATE TABLE orders (id INTEGER PRIMARY KEY);",
                query: "-- Write the verification query.\n",
            }),
        );
        const next = {
            ...previous,
            code: "SELECT sql FROM sqlite_master;\n",
        };

        expect(
            shouldNotifyCodeInputRegistry({
                id: "input-1",
                had: true,
                previous,
                next,
            }),
        ).toBe(false);
    });

    it("requests a provider render when registration is added or retargeted", () => {
        const previous = makeArgs(null, "exercise-1");
        const next = makeArgs(null, "exercise-2");

        expect(
            shouldNotifyCodeInputRegistry({
                id: "input-1",
                had: false,
                previous: undefined,
                next: previous,
            }),
        ).toBe(true);

        expect(
            shouldNotifyCodeInputRegistry({
                id: "input-1",
                had: true,
                previous,
                next,
            }),
        ).toBe(true);
    });
    it("preserves protected learner content while restoring missing authored companion files", () => {
        const previous = {
            version: 2,
            language: "python",
            entryFileId: "file:main.py",
            activeFileId: "file:main.py",
            openTabs: ["file:main.py"],
            expanded: [],
            nodes: [
                {
                    id: "file:main.py",
                    kind: "file",
                    name: "main.py",
                    parentId: null,
                    content: "print('learner edit')\n",
                    createdAt: 1,
                    updatedAt: 2,
                },
            ],
        } as any;

        const incoming = {
            version: 2,
            language: "python",
            entryFileId: "file:main.py",
            activeFileId: "file:main.py",
            openTabs: ["file:main.py"],
            expanded: ["folder:models"],
            nodes: [
                {
                    id: "file:main.py",
                    kind: "file",
                    name: "main.py",
                    parentId: null,
                    content: "print('starter')\n",
                    createdAt: 0,
                    updatedAt: 0,
                },
                {
                    id: "folder:models",
                    kind: "folder",
                    name: "models",
                    parentId: null,
                    createdAt: 0,
                    updatedAt: 0,
                },
                {
                    id: "file:models__transaction.py",
                    kind: "file",
                    name: "transaction.py",
                    parentId: "folder:models",
                    content: "class Transaction:\n    pass\n",
                    createdAt: 0,
                    updatedAt: 0,
                },
            ],
        } as any;

        const reconciled = reconcileProtectedCodeInputWorkspace({
            previous,
            incoming,
        });

        const main = reconciled?.nodes.find(
            (node: any) => node.kind === "file" && node.name === "main.py",
        );
        const transaction = reconciled?.nodes.find(
            (node: any) =>
                node.kind === "file" && node.name === "transaction.py",
        );
        const models = reconciled?.nodes.find(
            (node: any) => node.kind === "folder" && node.name === "models",
        );

        expect(main).toBeTruthy();
        expect(transaction).toBeTruthy();
        expect(models).toBeTruthy();

        if (!main || main.kind !== "file") {
            throw new Error("expected reconciled main.py to be a file");
        }
        if (!transaction || transaction.kind !== "file") {
            throw new Error("expected reconciled transaction.py to be a file");
        }

        expect(main.content).toBe("print('learner edit')\n");
        expect(transaction.content).toBe("class Transaction:\n    pass\n");
        expect(transaction.parentId).toBe(models?.id);
        expect(reconciled?.entryFileId).toBe("file:main.py");
        expect(reconciled?.activeFileId).toBe("file:main.py");
    });

});
