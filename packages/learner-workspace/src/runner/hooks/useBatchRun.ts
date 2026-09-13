"use client";

import { runViaApi } from "@zoeskoul/learner-workspace/lib/code/runClient";
import type { BatchRunReq, BatchRunResult } from "@zoeskoul/learner-workspace/lib/code/types/batch";

export async function runBatchClient(req: BatchRunReq, signal?: AbortSignal): Promise<BatchRunResult> {
    return runViaApi(req as any, signal) as Promise<BatchRunResult>;
}