import { describe, expect, it } from "vitest";

import { buildProjectRunRequest } from "./useIdeRunner";

const baseFile = {
    kind: "file" as const,
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
};

describe("buildProjectRunRequest", () => {
    it("submits main.py and data.txt for multi-file python runs", () => {
        const nodes = [
            {
                ...baseFile,
                id: "file:main.py",
                name: "main.py",
                content: 'with open("data.txt") as f:\n    print(f.read())\n',
            },
            {
                ...baseFile,
                id: "file:data.txt",
                name: "data.txt",
                content: "hello\n",
            },
        ];

        const req = buildProjectRunRequest({
            language: "python",
            nodes,
            activeFile: nodes[0],
            entryFile: nodes[0],
            activeFileId: "file:main.py",
            entryFileId: "file:main.py",
            sqlDialect: "sqlite",
            canUseMultiFile: true,
            code: nodes[0].content,
        });

        expect(req).toMatchObject({
            kind: "code",
            language: "python",
            entry: "main.py",
            files: [
                { path: "main.py", content: nodes[0].content },
                { path: "data.txt", content: "hello\n" },
            ],
        });
    });

    it("keeps single-file python runs as code-only requests", () => {
        const mainFile = {
            ...baseFile,
            id: "file:main.py",
            name: "main.py",
            content: 'print("hello")\n',
        };

        const req = buildProjectRunRequest({
            language: "python",
            nodes: [mainFile],
            activeFile: mainFile,
            entryFile: mainFile,
            activeFileId: "file:main.py",
            entryFileId: "file:main.py",
            sqlDialect: "sqlite",
            canUseMultiFile: true,
            code: mainFile.content,
        });

        expect(req).toEqual({
            kind: "code",
            language: "python",
            code: 'print("hello")\n',
        });
    });

    it("keeps sql requests on the sql payload path", () => {
        const queryFile = {
            ...baseFile,
            id: "file:query.sql",
            name: "query.sql",
            content: "SELECT * FROM products;",
        };

        const req = buildProjectRunRequest({
            language: "sql",
            nodes: [queryFile],
            activeFile: queryFile,
            entryFile: queryFile,
            activeFileId: "file:query.sql",
            entryFileId: "file:query.sql",
            sqlDialect: "sqlite",
            sqlDatasetId: "products_catalog",
            sqlResultShape: "table",
            canUseMultiFile: true,
            code: queryFile.content,
        });

        expect(req).toEqual({
            kind: "sql",
            mode: "batch",
            language: "sql",
            dialect: "sqlite",
            code: "SELECT * FROM products;",
            schemaSql: undefined,
            seedSql: undefined,
            datasetId: "products_catalog",
            resultShape: "table",
        });
    });
});
