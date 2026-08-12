import "server-only";

import type { BatchRunReq } from "@zoeskoul/code-contracts";
import { executeRunner } from "@zoeskoul/runner-client";
import { getSqlDataset } from "@zoeskoul/curriculum-runtime/subjects/sql/sql/datasets";

import type { RunReq, RunResult } from "@/lib/code/types";
import { isSqlRunReq } from "@/lib/code/types";

function firstNonBlank(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function codeWallTimeoutMs(req: RunReq) {
  if (isSqlRunReq(req)) return undefined;
  const seconds = Number((req as any)?.limits?.wall_time_limit);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.max(250, Math.min(60_000, Math.round(seconds * 1000)));
}

/**
 * Web-specific request projection. Dataset lookup stays in curriculum-runtime;
 * execution transport/engine selection lives only in @zoeskoul/runner-client.
 */
export async function executeWebBatchRun(
  req: RunReq,
  actorKey: string,
): Promise<RunResult> {
  let request: BatchRunReq;

  if (isSqlRunReq(req)) {
    const datasetId =
      typeof req.datasetId === "string" && req.datasetId.trim()
        ? req.datasetId.trim()
        : undefined;
    const dataset = datasetId ? getSqlDataset(datasetId) : null;
    const dialect = req.dialect ?? dataset?.dialect ?? "sqlite";
    const schemaSql = firstNonBlank(req.schemaSql, req.setupSql, dataset?.schemaSql);
    const seedSql = firstNonBlank(req.seedSql, dataset?.seedSql);

    request = {
      kind: "sql",
      language: "sql",
      dialect,
      code: req.code,
      resultShape: req.resultShape ?? "table",
      ...(req.checkSql ? { checkSql: req.checkSql } : {}),
      ...(schemaSql ? { schemaSql } : {}),
      ...(seedSql ? { seedSql } : {}),
      ...(datasetId ? { datasetId } : {}),
      ...(req.limits ? { limits: req.limits } : {}),
    } as BatchRunReq;
  } else {
    const wallTimeoutMs = codeWallTimeoutMs(req);
    request = {
      kind: "code",
      language: req.language,
      ...("code" in req && typeof req.code === "string" ? { code: req.code } : {}),
      ...("entry" in req && req.entry ? { entry: req.entry } : {}),
      ...("files" in req && req.files ? { files: req.files as any } : {}),
      ...("stdin" in req && req.stdin != null ? { stdin: req.stdin } : {}),
      ...(req.captureWorkspace ? { captureWorkspace: true } : {}),
      ...(wallTimeoutMs ? { wallTimeoutMs } : {}),
    } as BatchRunReq;
  }

  return (await executeRunner(request, { actorKey })) as RunResult;
}
