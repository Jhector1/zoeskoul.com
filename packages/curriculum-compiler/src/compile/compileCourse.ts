import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { buildPlanFromSpec } from "../spec/buildPlanFromSpec.js";
import { publishDraft } from "../write/publishDraft.js";
import {
    countPlanTopics,
    type CompileProgressCallback,
} from "./compileProgress.js";
import { compileSubjectPipeline } from "./compileSubjectPipeline.js";
import { rebuildSubjectFromDraftReports } from "./rebuildSubjectFromDraftReports.js";
import type { RebuildDraftSourcePreference } from "./savedDraftForRebuild.js";
import { resolveAuthoringCompileTarget } from "./resolveAuthoringCompileTarget.js";

export type CompileCourseMode = "generate" | "rebuild-from-drafts" | "upgrade-drafts";

export function resolveCompileCourseModeOptions(args: {
    draftOnly?: boolean;
    rebuildFromDrafts?: boolean;
    upgradeDrafts?: boolean;
    rebuildDraftSource?: RebuildDraftSourcePreference;
    syncReports?: boolean;
}) {
    if (args.rebuildDraftSource && !args.rebuildFromDrafts) {
        throw new Error("rebuildDraftSource requires --rebuild-from-drafts");
    }

    if (args.syncReports === false && !args.rebuildFromDrafts) {
        throw new Error("syncReports=false requires --rebuild-from-drafts");
    }

    if (args.rebuildFromDrafts && args.upgradeDrafts) {
        throw new Error("--rebuild-from-drafts and --upgrade-drafts cannot be used together");
    }

    if (args.rebuildFromDrafts && !args.draftOnly) {
        throw new Error("--rebuild-from-drafts requires --draft-only");
    }

    if (args.upgradeDrafts && !args.draftOnly) {
        throw new Error("--upgrade-drafts requires --draft-only");
    }

    const mode: CompileCourseMode = args.rebuildFromDrafts
        ? "rebuild-from-drafts"
        : args.upgradeDrafts
          ? "upgrade-drafts"
          : "generate";

    return {
        mode,
        rebuildDraftSource: args.rebuildDraftSource ?? "reports",
        syncReports: args.syncReports ?? true,
    };
}

export async function compileCourse(args: {
    subjectSlug: string;
    courseSlug: string;
    provider?: AiProvider;
    liveSubjectSlug?: string;
    forceLiveOverwrite?: boolean;
    onProgress?: CompileProgressCallback;
    resume?: boolean;
    publish?: boolean;
    draftOnly?: boolean;
    rebuildFromDrafts?: boolean;
    upgradeDrafts?: boolean;
    rebuildDraftSource?: RebuildDraftSourcePreference;
    syncReports?: boolean;
}) {
    const modeOptions = resolveCompileCourseModeOptions({
        draftOnly: args.draftOnly,
        rebuildFromDrafts: args.rebuildFromDrafts,
        upgradeDrafts: args.upgradeDrafts,
        rebuildDraftSource: args.rebuildDraftSource,
        syncReports: args.syncReports,
    });

    const target = await resolveAuthoringCompileTarget({
        subjectSlug: args.subjectSlug,
        courseSlug: args.courseSlug,
        options: {
            liveSubjectSlug: args.liveSubjectSlug,
            forceLiveOverwrite: args.forceLiveOverwrite,
            draftOnly: args.draftOnly,
        },
    });

    const plan = buildPlanFromSpec({
        blueprint: target.blueprint,
        spec: target.spec,
    });

    args.onProgress?.({
        current: 0,
        total: countPlanTopics(plan),
        stage: `loaded course spec ${args.subjectSlug}/${args.courseSlug}`,
    });

    if (modeOptions.mode === "upgrade-drafts") {
        throw new Error("--upgrade-drafts is reserved but not implemented yet. Use --rebuild-from-drafts for deterministic emitter-only rebuilds.");
    }

    const out = modeOptions.mode === "rebuild-from-drafts"
        ? await rebuildSubjectFromDraftReports({
              blueprint: target.blueprint,
              plan,
              spec: target.spec,
              onProgress: args.onProgress,
              rebuildDraftSource: modeOptions.rebuildDraftSource,
              syncReports: modeOptions.syncReports,
          })
        : await compileSubjectPipeline({
              blueprint: target.blueprint,
              plan,
              spec: target.spec,
              provider: args.provider ?? (() => {
                  throw new Error("compileCourse requires a provider unless --rebuild-from-drafts is used");
              })(),
              onProgress: args.onProgress,
              resume: args.resume,
          });

    if (args.publish !== false && target.publishToLive) {
        await publishDraft({
            subjectSlug: target.liveSubjectSlug,
        });
    }

    return {
        ...out,
        authoringSubjectSlug: target.authoringSubjectSlug,
        sourceCourseSlug: target.courseSlug,
        liveSubjectSlug: target.liveSubjectSlug,
    };
}
