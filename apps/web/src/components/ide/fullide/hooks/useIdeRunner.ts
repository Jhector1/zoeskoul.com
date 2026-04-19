"use client";

import { useCallback } from "react";
import type { SqlDialect, WorkspaceLanguage } from "@/lib/practice/types";
import type { RunResult } from "@/lib/code/types";
import type { ExecutionBackend } from "@/components/code/runner/runtime";
import { runViaApi } from "@/lib/code/runClient";
import { exportProjectFiles, relativeProjectPathOf } from "../../fsTree";
import { runBatchClient } from "@/components/code/runner/hooks/useBatchRun";
import { startInteractiveProjectRun } from "@/components/ide/fullide/runtime/startInteractiveProjectRun";
import {InteractiveLanguage, StartSessionResult} from "@zoeskoul/code-contracts";

type Args = {
    nodes: any[];
    activeFile: any | null;
    entryFile: any | null;
    activeFileId: string | null;
    entryFileId: string | null;
    sqlDialect: SqlDialect;
    canUseMultiFile: boolean;
    backend: ExecutionBackend;
};

type IdeRunArgs =
    | {
    language: "sql";
    code?: string;
    sqlDialect?: SqlDialect;
    signal?: AbortSignal;
}
    | {
    language: InteractiveLanguage;
    code?: string;
    stdin?: string;
    signal?: AbortSignal;
};

type IdeRunResponse = RunResult | StartSessionResult;

type ProjectFile = {
    path: string;
    content: string;
};

type ProjectSqlReq = {
    kind: "sql";
    mode: "batch";
    language: "sql";
    dialect: SqlDialect;
    code: string;
    schemaSql: string;
    seedSql: string;
};

type ProjectCodeReq =
    | {
    kind: "code";
    language: InteractiveLanguage;
    code: string;
}
    | {
    kind: "code";
    language: InteractiveLanguage;
    entry: string;
    files: ProjectFile[];
};

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
}): ProjectSqlReq | ProjectCodeReq {
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

    const files = exportProjectFiles(nodes) as ProjectFile[];

    if (language === "sql") {
        const schemaFile = files.find((f) =>
            f.path.toLowerCase().endsWith("schema.sql"),
        );
        const seedFile = files.find((f) =>
            f.path.toLowerCase().endsWith("seed.sql"),
        );
        const queryFile = files.find((f) =>
            f.path.toLowerCase().endsWith("query.sql"),
        );

        const activePath = String(
            activeFile?.path ?? activeFile?.name ?? ""
        ).toLowerCase();

        const activeIsSchema = activePath.endsWith("schema.sql");
        const activeIsSeed = activePath.endsWith("seed.sql");

        const activeQuery =
            !activeIsSchema && !activeIsSeed
                ? (activeFile?.content ?? "")
                : (queryFile?.content ?? code ?? "");

        return {
            kind: "sql",
            mode: "batch",
            language: "sql",
            dialect: sqlDialect,
            code: activeQuery,
            schemaSql: canUseMultiFile ? (schemaFile?.content ?? "") : "",
            seedSql: canUseMultiFile ? (seedFile?.content ?? "") : "",
        };
    }
    const shouldUseMultiFile = canUseMultiFile && files.length > 1;

    if (!shouldUseMultiFile) {
        return {
            kind: "code",
            language,
            code: activeFile?.content ?? entryFile?.content ?? code ?? "",
        };
    }

    const entryId = entryFileId ?? activeFileId;

    if (!entryId) {
        return {
            kind: "code",
            language,
            code: activeFile?.content ?? entryFile?.content ?? code ?? "",
        };
    }

    const entry = relativeProjectPathOf(nodes, entryId);

    return {
        kind: "code",
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
                                 backend,
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

            if (args.language === "sql") {
                return runBatchClient(req as ProjectSqlReq, args.signal);
            }

            if (backend === "pty") {
                return startInteractiveProjectRun(
                    {
                        ...req,
                        mode: "interactive",
                    } as any,
                    args.signal,
                );
            }

            return  runViaApi(
                {
                    ...req,
                    stdin: args.stdin ?? "",
                } as any,
                args.signal,
            ) as Promise<RunResult>;
        },
        [
            nodes,
            activeFile,
            entryFile,
            activeFileId,
            entryFileId,
            sqlDialect,
            canUseMultiFile,
            backend,
        ],
    );

    return { onRunProject };
}