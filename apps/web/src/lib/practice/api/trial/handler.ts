import type { TrialStartContext, TrialStartResult } from "./types";
import { startOrResumeTrial } from "./services/trialStart.service";

export async function handleTrialStart(
    ctx: TrialStartContext,
): Promise<TrialStartResult> {
    return startOrResumeTrial(ctx);
}
