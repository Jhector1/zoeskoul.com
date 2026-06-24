import { compileCourse } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import {
    finishProgressBar,
    renderProgressBar,
} from "../utils/renderProgressBar.js";
import { selectModelFromConsole } from "../utils/selectModel.js";

type CliRebuildDraftSourcePreference = "reports" | "current-output";

export function parseCompileCourseArgs(args: string[]) {
    const liveSubjectIndex = args.indexOf("--live-subject");
    const liveSubjectSlug =
        liveSubjectIndex >= 0 ? args[liveSubjectIndex + 1] : undefined;

    if (liveSubjectIndex >= 0 && !liveSubjectSlug) {
        throw new Error("--live-subject requires a live subject slug");
    }

    const preferCurrentDraftOutput = args.includes("--prefer-current-draft-output");
    const preferReports = args.includes("--prefer-reports");
    const rebuildDraftSource: CliRebuildDraftSourcePreference = preferCurrentDraftOutput
        ? "current-output"
        : "reports";

    const options = {
        draftOnly: args.includes("--draft-only"),
        liveSubjectSlug,
        resume: args.includes("--resume"),
        forceLiveOverwrite: args.includes("--force-live-overwrite"),
        rebuildFromDrafts: args.includes("--rebuild-from-drafts"),
        upgradeDrafts: args.includes("--upgrade-drafts"),
        preferCurrentDraftOutput,
        preferReports,
        syncReports: !args.includes("--no-sync-reports"),
        rebuildDraftSource,
    };

    if (options.preferCurrentDraftOutput && options.preferReports) {
        throw new Error("--prefer-current-draft-output and --prefer-reports cannot be used together");
    }

    if ((options.preferCurrentDraftOutput || options.preferReports) && !options.rebuildFromDrafts) {
        throw new Error("--prefer-current-draft-output and --prefer-reports require --rebuild-from-drafts");
    }

    if (args.includes("--no-sync-reports") && !options.rebuildFromDrafts) {
        throw new Error("--no-sync-reports requires --rebuild-from-drafts");
    }

    if (options.rebuildFromDrafts && options.upgradeDrafts) {
        throw new Error("--rebuild-from-drafts and --upgrade-drafts cannot be used together");
    }

    if (options.rebuildFromDrafts && !options.draftOnly) {
        throw new Error("--rebuild-from-drafts requires --draft-only");
    }

    if (options.upgradeDrafts && !options.draftOnly) {
        throw new Error("--upgrade-drafts requires --draft-only");
    }

    return options;
}

export async function runCompileCourse(
    subjectSlug: string,
    courseSlug: string,
    args: string[] = [],
) {
    const options = parseCompileCourseArgs(args);

    if (!options.rebuildFromDrafts && !options.upgradeDrafts) {
        await selectModelFromConsole();
    }
    let sawProgress = false;

    console.log(`Compiling course ${subjectSlug}/${courseSlug}...`);

    try {
        const out = await compileCourse({
            subjectSlug,
            courseSlug,
            provider: openAiProvider,
            liveSubjectSlug: options.liveSubjectSlug,
            forceLiveOverwrite: options.forceLiveOverwrite,
            resume: options.resume,
            draftOnly: options.draftOnly,
            rebuildFromDrafts: options.rebuildFromDrafts,
            upgradeDrafts: options.upgradeDrafts,
            rebuildDraftSource: options.rebuildDraftSource,
            syncReports: options.syncReports,
            onProgress: (info) => {
                sawProgress = true;
                renderProgressBar({
                    current: info.current,
                    total: info.total,
                    label: info.topicId
                        ? `${info.stage} - ${info.topicId}`
                        : info.stage,
                });
            },
        });

        if (sawProgress) {
            finishProgressBar(
                `✔ Compiled ${out.authoringSubjectSlug}/${out.sourceCourseSlug} into ${out.liveSubjectSlug}${options.draftOnly ? " (draft-only)" : ""}`,
            );
        } else {
            console.log(
                `Compiled ${out.authoringSubjectSlug}/${out.sourceCourseSlug} into ${out.liveSubjectSlug}${options.draftOnly ? " (draft-only)" : ""}`,
            );
        }
    } catch (error) {
        if (sawProgress) {
            finishProgressBar("✖ Compile failed");
        }
        throw error;
    }
}
