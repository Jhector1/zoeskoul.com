import { describe, expect, it } from "vitest";

import {
    codeInputRegistrationKey,
    isSameCodeFeedback,
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
});

