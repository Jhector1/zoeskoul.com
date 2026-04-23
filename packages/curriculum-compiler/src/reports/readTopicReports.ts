import fs from "node:fs/promises";
import path from "node:path";
import type {
    CritiqueReport,
    RepairReport,
    SemanticValidationReport,
} from "@zoeskoul/curriculum-profiles";

export type TopicReportBundle = {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
    rawDraft?: unknown;
    repairedDraft?: unknown;
    repairReport?: RepairReport;
    critiqueReport?: CritiqueReport;
    semanticReport?: SemanticValidationReport;
    topicBundle?: unknown;
};

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJsonIfExists(filePath: string) {
    if (!(await pathExists(filePath))) return undefined;
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

export async function readTopicReports(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
}): Promise<TopicReportBundle> {
    const baseDir = path.join(
        ".curriculum-drafts",
        "reports",
        args.subjectSlug,
        `module${args.moduleOrder}`,
        args.topicId,
    );

    return {
        subjectSlug: args.subjectSlug,
        moduleOrder: args.moduleOrder,
        topicId: args.topicId,
        rawDraft: await readJsonIfExists(path.join(baseDir, "raw-draft.json")),
        repairedDraft: await readJsonIfExists(path.join(baseDir, "repaired-draft.json")),
        repairReport: await readJsonIfExists(path.join(baseDir, "repair-report.json")),
        critiqueReport: await readJsonIfExists(path.join(baseDir, "critique-report.json")),
        semanticReport: await readJsonIfExists(path.join(baseDir, "semantic-report.json")),
        topicBundle: await readJsonIfExists(path.join(baseDir, "emitted-topic-bundle.json")),
    };
}

export async function readSubjectTopicReports(args: {
    subjectSlug: string;
}): Promise<TopicReportBundle[]> {
    const root = path.join(".curriculum-drafts", "reports", args.subjectSlug);

    if (!(await pathExists(root))) return [];

    const moduleDirs = await fs.readdir(root, { withFileTypes: true });
    const out: TopicReportBundle[] = [];

    for (const moduleDir of moduleDirs) {
        if (!moduleDir.isDirectory()) continue;

        const match = moduleDir.name.match(/^module(\d+)$/);
        if (!match) continue;

        const moduleOrder = Number(match[1]);
        const modulePath = path.join(root, moduleDir.name);
        const topicDirs = await fs.readdir(modulePath, { withFileTypes: true });

        for (const topicDir of topicDirs) {
            if (!topicDir.isDirectory()) continue;

            out.push(
                await readTopicReports({
                    subjectSlug: args.subjectSlug,
                    moduleOrder,
                    topicId: topicDir.name,
                }),
            );
        }
    }

    return out;
}