import {
    backupCurrentDraftCourse,
    listCourseBackupKeys,
    resolveAuthoringCompileTarget,
    restoreCourseBackupToDraft,
} from "@zoeskoul/curriculum-compiler";

function readFlagValue(args: string[], flagName: string) {
    const index = args.indexOf(flagName);
    const value = index >= 0 ? args[index + 1] : undefined;

    if (index >= 0 && !value) {
        throw new Error(`${flagName} requires a value`);
    }

    return value;
}

function rejectUnknownFlags(args: string[], allowedFlags: Set<string>) {
    for (const arg of args) {
        if (arg.startsWith("--") && !allowedFlags.has(arg)) {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
}

async function resolveCheckedDraftTarget(subjectSlug: string, courseSlug: string) {
    const target = await resolveAuthoringCompileTarget({
        subjectSlug,
        courseSlug,
        options: {
            draftOnly: true,
        },
    });

    if (target.courseSlug !== courseSlug) {
        throw new Error(
            `Draft command resolved the wrong course: requested ${courseSlug} but resolved ${target.courseSlug}. Aborting.`,
        );
    }

    if (target.authoringSubjectSlug !== subjectSlug) {
        throw new Error(
            `Draft command resolved the wrong subject: requested ${subjectSlug} but resolved ${target.authoringSubjectSlug}. Aborting.`,
        );
    }

    return target;
}

export function parseBackupCourseDraftArgs(args: string[]) {
    rejectUnknownFlags(args, new Set(["--backup-key"]));

    return {
        backupKey: readFlagValue(args, "--backup-key"),
    };
}

export function parseRestoreCourseDraftArgs(args: string[]) {
    rejectUnknownFlags(args, new Set(["--backup-key", "--backup-subject", "--force"]));

    const backupKey = readFlagValue(args, "--backup-key");

    if (!backupKey) {
        throw new Error("restore-course-draft requires --backup-key <backupKey>");
    }

    return {
        backupKey,
        backupSubjectSlug: readFlagValue(args, "--backup-subject"),
        force: args.includes("--force"),
    };
}

export async function runBackupCourseDraft(
    subjectSlug: string,
    courseSlug: string,
    args: string[] = [],
) {
    const options = parseBackupCourseDraftArgs(args);
    const target = await resolveCheckedDraftTarget(subjectSlug, courseSlug);

    const result = await backupCurrentDraftCourse({
        draftSubjectSlug: target.liveSubjectSlug,
        courseSlug,
        backupKey: options.backupKey,
    });

    console.log(
        `Backed up draft ${subjectSlug}/${courseSlug} (${target.liveSubjectSlug}) as ${result.backupKey}`,
    );

    return result;
}

export async function runRestoreCourseDraft(
    subjectSlug: string,
    courseSlug: string,
    args: string[] = [],
) {
    const options = parseRestoreCourseDraftArgs(args);
    const target = await resolveCheckedDraftTarget(subjectSlug, courseSlug);

    const result = await restoreCourseBackupToDraft({
        catalogSubjectSlug: subjectSlug,
        draftSubjectSlug: target.liveSubjectSlug,
        courseSlug,
        backupKey: options.backupKey,
        backupSubjectSlug: options.backupSubjectSlug,
        force: options.force,
    });

    const replacedDraftMessage = result.replacedDraftBackupKey
        ? ` Existing draft was first backed up as ${result.replacedDraftBackupKey}.`
        : "";

    console.log(
        `Restored backup ${result.backupKey} (${result.sourceSubjectSlug}) into draft ${target.liveSubjectSlug}.${replacedDraftMessage}`,
    );

    return result;
}

export async function runListCourseBackups(
    subjectSlug: string,
    courseSlug: string,
) {
    const target = await resolveCheckedDraftTarget(subjectSlug, courseSlug);
    const backups = await listCourseBackupKeys({
        catalogSubjectSlug: subjectSlug,
        courseSlug,
        draftSubjectSlug: target.liveSubjectSlug,
    });

    if (backups.length === 0) {
        console.log(`No backups found for ${subjectSlug}/${courseSlug}.`);
        return backups;
    }

    for (const backup of backups) {
        const subjects = backup.sourceSubjectSlugs.join(", ") || "(no subjects)";
        console.log(`${backup.backupKey}\t${subjects}`);
    }

    return backups;
}
