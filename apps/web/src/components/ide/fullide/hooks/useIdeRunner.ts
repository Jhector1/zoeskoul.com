"use client";

import { useCallback } from "react";
import type { SqlDialect, CodeLanguage } from "@/lib/practice/types";
import type { RunResult } from "@/lib/code/types";
import type { StartSessionResult } from "@/lib/code/types/session";
import { exportProjectFiles, pathOf } from "../../fsTree";
import { runBatchClient } from "@/components/code/runner/hooks/useBatchRun";
import { startInteractiveProjectRun } from "@/components/ide/fullide/runtime/startInteractiveProjectRun";

type Args = {
    nodes: any[];
    activeFile: any | null;
    entryFile: any | null;
    activeFileId: string | null;
    entryFileId: string | null;
    sqlDialect: SqlDialect;
    canUseMultiFile: boolean;
};

type IdeRunArgs =
    | {
    language: "sql";
    code?: string;
    sqlDialect?: SqlDialect;
    signal?: AbortSignal;
}
    | {
    language: Exclude<CodeLanguage, "sql">;
    code?: string;
    stdin?: string;
    signal?: AbortSignal;
};

type IdeRunResponse = RunResult | StartSessionResult;

function buildProjectRunRequest(args: {
    language: IdeRunArgs["language"];
    nodes: any[];
    activeFile: any | null;
    entryFile: any | null;
    activeFileId: string | null;
    entryFileId: string | null;
    sqlDialect: SqlDialect;
    canUseMultiFile: boolean;
    code?: string;
}) {
    const {
        language,
        nodes,
        activeFile,
        entryFile,
        activeFileId,
        entryFileId,
        sqlDialect,
        canUseMultiFile,
        code,
    } = args;

    const files = exportProjectFiles(nodes);

    console.log("IDE canUseMultiFile", canUseMultiFile);
    console.log("IDE exported files", files.map((f) => f.path));
    console.log("IDE activeFileId", activeFileId);
    console.log("IDE entryFileId", entryFileId);

    if (language === "sql") {
        const schemaFile = files.find((f) =>
            f.path.toLowerCase().endsWith("schema.sql"),
        );
        const seedFile = files.find((f) =>
            f.path.toLowerCase().endsWith("seed.sql"),
        );

        const activeQuery =
            activeFile?.content ??
            files.find((f) => f.path.toLowerCase().endsWith("query.sql"))?.content ??
            code ??
            "";

        return {
            kind: "sql" as const,
            mode: "batch" as const,
            language: "sql" as const,
            dialect: sqlDialect,
            code: activeQuery,
            schemaSql: canUseMultiFile ? (schemaFile?.content ?? "") : "",
            seedSql: canUseMultiFile ? (seedFile?.content ?? "") : "",
        };
    }

    const shouldUseMultiFile = canUseMultiFile && files.length > 1;
    console.log("IDE shouldUseMultiFile", shouldUseMultiFile);

    if (!shouldUseMultiFile) {
        console.log("IDE using single-file fallback");
        return {
            kind: "code" as const,
            mode: "interactive" as const,
            language,
            code: activeFile?.content ?? entryFile?.content ?? code ?? "",
        };
    }

    const entryId = entryFileId ?? activeFileId;

    if (!entryId) {
        console.log("IDE missing entryId, using single-file fallback");
        return {
            kind: "code" as const,
            mode: "interactive" as const,
            language,
            code: activeFile?.content ?? entryFile?.content ?? code ?? "",
        };
    }

    const entry = pathOf(nodes, entryId);
    console.log("IDE using multi-file run with entry", entry);

    return {
        kind: "code" as const,
        mode: "interactive" as const,
        language,
        entry,
        files,
    };
}

export function useIdeRunner({
                                 nodes,
                                 activeFile,
                                 entryFile,
                                 activeFileId,
                                 entryFileId,
                                 sqlDialect,
                                 canUseMultiFile,
                             }: Args) {
    const onRunProject = useCallback(
        async (args: IdeRunArgs): Promise<IdeRunResponse> => {
            const req = buildProjectRunRequest({
                language: args.language,
                nodes,
                activeFile,
                entryFile,
                activeFileId,
                entryFileId,
                sqlDialect:
                    args.language === "sql" ? (args.sqlDialect ?? sqlDialect) : sqlDialect,
                canUseMultiFile,
                code: args.code,
            });

            if (req.kind === "sql") {
                return runBatchClient(req, args.signal);
            }

            return startInteractiveProjectRun(req, args.signal);
        },
        [
            nodes,
            activeFile,
            entryFile,
            activeFileId,
            entryFileId,
            sqlDialect,
            canUseMultiFile,
        ],
    );

    return { onRunProject };
}