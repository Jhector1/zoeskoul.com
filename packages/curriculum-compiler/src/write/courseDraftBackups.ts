import fs from "node:fs/promises";
import path from "node:path";
import {
    getBackupRoot,
    getBackupSubjectManifestPath,
    getBackupTopicBundlePath,
    getBackupTopicMessagesPath,
    getDraftMessagesRoot,
    getDraftSubjectManifestPath,
    getDraftSubjectMessagesPath,
    getDraftSubjectRoot,
    getDraftTopicBundlePath,
    getDraftTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJsonValidated(filePath: string) {
    const raw = await fs.readFile(filePath, "utf8");
    JSON.parse(raw);
    return raw;
}

async function writeRawAtomic(filePath: string, raw: string) {
    const tempPath = `${filePath}.tmp`;
    await ensureDir(filePath);
    await fs.writeFile(tempPath, raw, "utf8");
    await fs.rename(tempPath, filePath);
}

function rewriteSubjectSlugDeep(
    value: unknown,
    fromSubjectSlug: string,
    toSubjectSlug: string,
): unknown {
    if (fromSubjectSlug === toSubjectSlug) {
        return value;
    }

    if (typeof value === "string") {
        return value.split(fromSubjectSlug).join(toSubjectSlug);
    }

    if (Array.isArray(value)) {
        return value.map((item) =>
            rewriteSubjectSlugDeep(item, fromSubjectSlug, toSubjectSlug),
        );
    }

    if (value && typeof value === "object") {
        const next: Record<string, unknown> = {};

        for (const [key, childValue] of Object.entries(
            value as Record<string, unknown>,
        )) {
            const nextKey = key.split(fromSubjectSlug).join(toSubjectSlug);
            next[nextKey] = rewriteSubjectSlugDeep(
                childValue,
                fromSubjectSlug,
                toSubjectSlug,
            );
        }

        return next;
    }

    return value;
}

function rewriteJsonRawForSubject(args: {
    raw: string;
    fromSubjectSlug: string;
    toSubjectSlug: string;
}) {
    JSON.parse(args.raw);

    if (args.fromSubjectSlug === args.toSubjectSlug) {
        return args.raw;
    }

    const rewritten = rewriteSubjectSlugDeep(
        JSON.parse(args.raw),
        args.fromSubjectSlug,
        args.toSubjectSlug,
    );

    return `${JSON.stringify(rewritten, null, 2)}\n`;
}

async function readJsonForSubjectRewrite(args: {
    filePath: string;
    fromSubjectSlug: string;
    toSubjectSlug: string;
}) {
    const raw = await readJsonValidated(args.filePath);

    return rewriteJsonRawForSubject({
        raw,
        fromSubjectSlug: args.fromSubjectSlug,
        toSubjectSlug: args.toSubjectSlug,
    });
}

function makeTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function makeDateTimeBackupSuffix() {
    const now = new Date();
    const date = [
        now.getUTCFullYear(),
        String(now.getUTCMonth() + 1).padStart(2, "0"),
        String(now.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const time = [
        String(now.getUTCHours()).padStart(2, "0"),
        String(now.getUTCMinutes()).padStart(2, "0"),
        String(now.getUTCSeconds()).padStart(2, "0"),
    ].join("-");

    return `${date}--${time}`;
}

function makeDraftBackupKey(courseSlug: string) {
    return `${courseSlug}--draft--${makeDateTimeBackupSuffix()}`;
}

function assertSafeBackupKey(backupKey: string) {
    const normalized = String(backupKey ?? "").trim();

    if (!normalized) {
        throw new Error("Backup key is required.");
    }

    if (
        normalized.includes("/") ||
        normalized.includes("\\") ||
        normalized === "." ||
        normalized === ".." ||
        normalized.includes("../") ||
        normalized.includes("..\\")
    ) {
        throw new Error(`Unsafe backup key: ${backupKey}`);
    }

    return normalized;
}

function getBackupSubjectMessagesPath(
    backupKey: string,
    locale: string,
    subjectSlug: string,
) {
    return path.join(
        getBackupRoot(backupKey, subjectSlug),
        "messages",
        locale,
        "subjects",
        subjectSlug,
        "subject.json",
    );
}

async function backupDraftMessages(args: {
    backupKey: string;
    draftSubjectSlug: string;
}) {
    const draftMessagesRoot = getDraftMessagesRoot(args.draftSubjectSlug);

    if (!(await pathExists(draftMessagesRoot))) {
        return;
    }

    const localeDirs = await fs.readdir(draftMessagesRoot, { withFileTypes: true });

    for (const localeDir of localeDirs) {
        if (!localeDir.isDirectory()) continue;

        const locale = localeDir.name;
        const draftSubjectMessagesDir = path.join(
            draftMessagesRoot,
            locale,
            "subjects",
            args.draftSubjectSlug,
        );

        if (!(await pathExists(draftSubjectMessagesDir))) continue;

        const draftSubjectJsonPath = getDraftSubjectMessagesPath(
            locale,
            args.draftSubjectSlug,
        );

        if (await pathExists(draftSubjectJsonPath)) {
            const raw = await readJsonValidated(draftSubjectJsonPath);
            await writeRawAtomic(
                getBackupSubjectMessagesPath(
                    args.backupKey,
                    locale,
                    args.draftSubjectSlug,
                ),
                raw,
            );
        }

        const moduleDirs = await fs.readdir(draftSubjectMessagesDir, {
            withFileTypes: true,
        });

        for (const moduleDir of moduleDirs) {
            if (!moduleDir.isDirectory()) continue;

            const draftModuleDir = path.join(draftSubjectMessagesDir, moduleDir.name);
            const files = await fs.readdir(draftModuleDir, { withFileTypes: true });

            for (const file of files) {
                if (!file.isFile() || !file.name.endsWith(".json")) continue;

                const topicId = file.name.replace(/\.json$/, "");
                const raw = await readJsonValidated(
                    getDraftTopicMessagesPath(
                        locale,
                        args.draftSubjectSlug,
                        moduleDir.name,
                        topicId,
                    ),
                );

                await writeRawAtomic(
                    getBackupTopicMessagesPath(
                        args.backupKey,
                        locale,
                        args.draftSubjectSlug,
                        moduleDir.name,
                        topicId,
                    ),
                    raw,
                );
            }
        }
    }
}

export async function backupCurrentDraftCourse(args: {
    draftSubjectSlug: string;
    courseSlug: string;
    backupKey?: string;
}) {
    const backupKey = assertSafeBackupKey(
        args.backupKey ?? makeDraftBackupKey(args.courseSlug),
    );
    const draftManifestPath = getDraftSubjectManifestPath(args.draftSubjectSlug);

    if (!(await pathExists(draftManifestPath))) {
        throw new Error(`Draft subject manifest not found: ${draftManifestPath}`);
    }

    const manifestRaw = await readJsonValidated(draftManifestPath);
    await writeRawAtomic(
        getBackupSubjectManifestPath(backupKey, args.draftSubjectSlug),
        manifestRaw,
    );

    const draftModulesRoot = path.join(
        getDraftSubjectRoot(args.draftSubjectSlug),
        "modules",
    );

    if (await pathExists(draftModulesRoot)) {
        const moduleDirs = await fs.readdir(draftModulesRoot, { withFileTypes: true });

        for (const moduleDir of moduleDirs) {
            if (!moduleDir.isDirectory()) continue;

            const topicsRoot = path.join(draftModulesRoot, moduleDir.name, "topics");
            if (!(await pathExists(topicsRoot))) continue;

            const topicDirs = await fs.readdir(topicsRoot, { withFileTypes: true });

            for (const topicDir of topicDirs) {
                if (!topicDir.isDirectory()) continue;

                const topicId = topicDir.name;
                const bundleRaw = await readJsonValidated(
                    getDraftTopicBundlePath(args.draftSubjectSlug, moduleDir.name, topicId),
                );

                await writeRawAtomic(
                    getBackupTopicBundlePath(
                        backupKey,
                        args.draftSubjectSlug,
                        moduleDir.name,
                        topicId,
                    ),
                    bundleRaw,
                );
            }
        }
    }

    await backupDraftMessages({
        backupKey,
        draftSubjectSlug: args.draftSubjectSlug,
    });

    return {
        ok: true,
        backupKey,
        backupTimestamp: makeTimestamp(),
    };
}

async function getDraftHasAnyFiles(draftSubjectSlug: string) {
    if (await pathExists(getDraftSubjectRoot(draftSubjectSlug))) {
        return true;
    }

    const draftMessagesRoot = getDraftMessagesRoot(draftSubjectSlug);
    if (!(await pathExists(draftMessagesRoot))) {
        return false;
    }

    const localeDirs = await fs.readdir(draftMessagesRoot, { withFileTypes: true });

    for (const localeDir of localeDirs) {
        if (!localeDir.isDirectory()) continue;

        if (
            await pathExists(
                path.join(
                    draftMessagesRoot,
                    localeDir.name,
                    "subjects",
                    draftSubjectSlug,
                ),
            )
        ) {
            return true;
        }
    }

    return false;
}

async function removeDraftSubjectArtifacts(draftSubjectSlug: string) {
    await fs.rm(getDraftSubjectRoot(draftSubjectSlug), {
        recursive: true,
        force: true,
    });

    const draftMessagesRoot = getDraftMessagesRoot(draftSubjectSlug);
    if (!(await pathExists(draftMessagesRoot))) {
        return;
    }

    const localeDirs = await fs.readdir(draftMessagesRoot, { withFileTypes: true });

    for (const localeDir of localeDirs) {
        if (!localeDir.isDirectory()) continue;

        await fs.rm(
            path.join(draftMessagesRoot, localeDir.name, "subjects", draftSubjectSlug),
            { recursive: true, force: true },
        );
    }
}

async function findBackupSubjectSlug(args: {
    backupKey: string;
    catalogSubjectSlug: string;
    preferredBackupSubjectSlug?: string;
}) {
    const backupRoot = getBackupRoot(args.backupKey, args.catalogSubjectSlug);
    const backupSubjectsRoot = path.join(backupRoot, "subjects");

    if (!(await pathExists(backupSubjectsRoot))) {
        throw new Error(`Backup subjects directory not found: ${backupSubjectsRoot}`);
    }

    const subjectDirs = (await fs.readdir(backupSubjectsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

    if (args.preferredBackupSubjectSlug) {
        if (!subjectDirs.includes(args.preferredBackupSubjectSlug)) {
            throw new Error(
                `Backup ${args.backupKey} does not contain subject ${args.preferredBackupSubjectSlug}. Available subjects: ${subjectDirs.join(", ") || "(none)"}`,
            );
        }

        return args.preferredBackupSubjectSlug;
    }

    if (subjectDirs.length === 1) {
        return subjectDirs[0];
    }

    throw new Error(
        `Backup ${args.backupKey} contains ${subjectDirs.length} subjects. Re-run with --backup-subject <subjectSlug>. Available subjects: ${subjectDirs.join(", ") || "(none)"}`,
    );
}

async function restoreBackupMessagesToDraft(args: {
    backupKey: string;
    sourceSubjectSlug: string;
    draftSubjectSlug: string;
}) {
    const backupRoot = getBackupRoot(args.backupKey, args.sourceSubjectSlug);
    const backupMessagesRoot = path.join(backupRoot, "messages");

    if (!(await pathExists(backupMessagesRoot))) {
        return;
    }

    const localeDirs = await fs.readdir(backupMessagesRoot, { withFileTypes: true });

    for (const localeDir of localeDirs) {
        if (!localeDir.isDirectory()) continue;

        const locale = localeDir.name;
        const backupSubjectMessagesDir = path.join(
            backupMessagesRoot,
            locale,
            "subjects",
            args.sourceSubjectSlug,
        );

        if (!(await pathExists(backupSubjectMessagesDir))) continue;

        const backupSubjectJsonPath = path.join(
            backupSubjectMessagesDir,
            "subject.json",
        );

        if (await pathExists(backupSubjectJsonPath)) {
            const subjectMessageRaw = await readJsonForSubjectRewrite({
                filePath: backupSubjectJsonPath,
                fromSubjectSlug: args.sourceSubjectSlug,
                toSubjectSlug: args.draftSubjectSlug,
            });

            await writeRawAtomic(
                getDraftSubjectMessagesPath(locale, args.draftSubjectSlug),
                subjectMessageRaw,
            );
        }

        const moduleDirs = await fs.readdir(backupSubjectMessagesDir, {
            withFileTypes: true,
        });

        for (const moduleDir of moduleDirs) {
            if (!moduleDir.isDirectory()) continue;

            const backupModuleDir = path.join(backupSubjectMessagesDir, moduleDir.name);
            const files = await fs.readdir(backupModuleDir, { withFileTypes: true });

            for (const file of files) {
                if (!file.isFile() || !file.name.endsWith(".json")) continue;

                const topicId = file.name.replace(/\.json$/, "");
                const messageRaw = await readJsonForSubjectRewrite({
                    filePath: path.join(backupModuleDir, file.name),
                    fromSubjectSlug: args.sourceSubjectSlug,
                    toSubjectSlug: args.draftSubjectSlug,
                });

                await writeRawAtomic(
                    getDraftTopicMessagesPath(
                        locale,
                        args.draftSubjectSlug,
                        moduleDir.name,
                        topicId,
                    ),
                    messageRaw,
                );
            }
        }
    }
}

export async function restoreCourseBackupToDraft(args: {
    catalogSubjectSlug: string;
    draftSubjectSlug: string;
    courseSlug: string;
    backupKey: string;
    force?: boolean;
    backupSubjectSlug?: string;
}) {
    const backupKey = assertSafeBackupKey(args.backupKey);
    const sourceSubjectSlug = await findBackupSubjectSlug({
        backupKey,
        catalogSubjectSlug: args.catalogSubjectSlug,
        preferredBackupSubjectSlug: args.backupSubjectSlug,
    });
    const backupManifestPath = getBackupSubjectManifestPath(
        backupKey,
        sourceSubjectSlug,
    );

    if (!(await pathExists(backupManifestPath))) {
        throw new Error(`Backup subject manifest not found: ${backupManifestPath}`);
    }

    let replacedDraftBackupKey: string | undefined;
    const draftHasFiles = await getDraftHasAnyFiles(args.draftSubjectSlug);

    if (draftHasFiles) {
        if (!args.force) {
            throw new Error(
                `Draft already exists for ${args.draftSubjectSlug}. Re-run with --force to back up the current draft before restoring ${backupKey}.`,
            );
        }

        const backupResult = await backupCurrentDraftCourse({
            draftSubjectSlug: args.draftSubjectSlug,
            courseSlug: args.courseSlug,
        });
        replacedDraftBackupKey = backupResult.backupKey;
    }

    await removeDraftSubjectArtifacts(args.draftSubjectSlug);

    const manifestRaw = await readJsonForSubjectRewrite({
        filePath: backupManifestPath,
        fromSubjectSlug: sourceSubjectSlug,
        toSubjectSlug: args.draftSubjectSlug,
    });

    await writeRawAtomic(getDraftSubjectManifestPath(args.draftSubjectSlug), manifestRaw);

    const backupModulesRoot = path.join(
        getBackupRoot(backupKey, sourceSubjectSlug),
        "subjects",
        sourceSubjectSlug,
        "modules",
    );

    if (await pathExists(backupModulesRoot)) {
        const moduleDirs = await fs.readdir(backupModulesRoot, { withFileTypes: true });

        for (const moduleDir of moduleDirs) {
            if (!moduleDir.isDirectory()) continue;

            const topicsRoot = path.join(backupModulesRoot, moduleDir.name, "topics");
            if (!(await pathExists(topicsRoot))) continue;

            const topicDirs = await fs.readdir(topicsRoot, { withFileTypes: true });

            for (const topicDir of topicDirs) {
                if (!topicDir.isDirectory()) continue;

                const topicId = topicDir.name;
                const backupBundlePath = path.join(
                    topicsRoot,
                    topicId,
                    "topic.bundle.json",
                );
                const bundleRaw = await readJsonForSubjectRewrite({
                    filePath: backupBundlePath,
                    fromSubjectSlug: sourceSubjectSlug,
                    toSubjectSlug: args.draftSubjectSlug,
                });

                await writeRawAtomic(
                    getDraftTopicBundlePath(args.draftSubjectSlug, moduleDir.name, topicId),
                    bundleRaw,
                );
            }
        }
    }

    await restoreBackupMessagesToDraft({
        backupKey,
        sourceSubjectSlug,
        draftSubjectSlug: args.draftSubjectSlug,
    });

    return {
        ok: true,
        backupKey,
        sourceSubjectSlug,
        draftSubjectSlug: args.draftSubjectSlug,
        replacedDraftBackupKey,
    };
}

export async function listCourseBackupKeys(args: {
    catalogSubjectSlug: string;
    courseSlug: string;
    draftSubjectSlug?: string;
}) {
    const backupsRoot = path.dirname(
        getBackupRoot("__backup-key-placeholder__", args.catalogSubjectSlug),
    );

    if (!(await pathExists(backupsRoot))) {
        return [];
    }

    const backupDirs = await fs.readdir(backupsRoot, { withFileTypes: true });
    const matches = [] as Array<{
        backupKey: string;
        sourceSubjectSlugs: string[];
        modifiedTimeMs: number;
    }>;

    for (const backupDir of backupDirs) {
        if (!backupDir.isDirectory()) continue;

        const backupRoot = path.join(backupsRoot, backupDir.name);
        const subjectsRoot = path.join(backupRoot, "subjects");
        const sourceSubjectSlugs = (await pathExists(subjectsRoot))
            ? (await fs.readdir(subjectsRoot, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort((a, b) => a.localeCompare(b))
            : [];
        const matchesCoursePrefix = backupDir.name.startsWith(`${args.courseSlug}--`);
        const matchesDraftSubject = args.draftSubjectSlug
            ? sourceSubjectSlugs.includes(args.draftSubjectSlug)
            : false;

        if (!matchesCoursePrefix && !matchesDraftSubject) continue;

        const stat = await fs.stat(backupRoot);

        matches.push({
            backupKey: backupDir.name,
            sourceSubjectSlugs,
            modifiedTimeMs: stat.mtimeMs,
        });
    }

    return matches.sort((a, b) => b.modifiedTimeMs - a.modifiedTimeMs);
}
