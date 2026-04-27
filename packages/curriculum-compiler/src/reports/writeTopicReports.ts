import fs from "node:fs/promises";
import path from "node:path";
import type {
    CritiqueReport,
    GoldenValidationReport,
    RepairReport,
    SemanticValidationReport,
} from "@zoeskoul/curriculum-profiles";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJsonAtomic(filePath: string, value: unknown) {
    const tempPath = `${filePath}.tmp`;
    await ensureDir(filePath);
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2) + "\n", "utf8");
    await fs.rename(tempPath, filePath);
}

export async function writeTopicReports(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
    rawDraft?: unknown;
    repairedDraft?: unknown;
    repairReport?: RepairReport;
    critiqueReport?: CritiqueReport;
    semanticReport?: SemanticValidationReport;
    goldenReport?: GoldenValidationReport;
    topicBundle?: unknown;
}) {
    const baseDir = path.join(
        ".curriculum-drafts",
        "reports",
        args.subjectSlug,
        `module${args.moduleOrder}`,
        args.topicId,
    );

    if (args.rawDraft !== undefined) {
        await writeJsonAtomic(path.join(baseDir, "raw-draft.json"), args.rawDraft);
    }

    if (args.repairedDraft !== undefined) {
        await writeJsonAtomic(path.join(baseDir, "repaired-draft.json"), args.repairedDraft);
    }

    if (args.repairReport) {
        await writeJsonAtomic(path.join(baseDir, "repair-report.json"), args.repairReport);
    }

    if (args.critiqueReport) {
        await writeJsonAtomic(path.join(baseDir, "critique-report.json"), args.critiqueReport);
    }

    if (args.semanticReport) {
        await writeJsonAtomic(path.join(baseDir, "semantic-report.json"), args.semanticReport);
    }

    if (args.goldenReport) {
        await writeJsonAtomic(path.join(baseDir, "golden-report.json"), args.goldenReport);
    }

    if (args.topicBundle !== undefined) {
        await writeJsonAtomic(path.join(baseDir, "emitted-topic-bundle.json"), args.topicBundle);
    }
}
