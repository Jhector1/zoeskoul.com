import fs from "node:fs/promises";
import path from "node:path";
import {
    getDraftSubjectManifestPath,
    getDraftSubjectMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJsonAtomic(filePath: string, data: unknown) {
    const tempPath = `${filePath}.tmp`;
    await ensureDir(filePath);
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    await fs.rename(tempPath, filePath);
}

export async function writeSubjectArtifacts(args: {
    subjectSlug: string;
    subjectManifest: unknown;
    subjectMessagesByLocale?: Record<string, Record<string, unknown>>;
}) {
    const manifestPath = getDraftSubjectManifestPath(args.subjectSlug);

    await writeJsonAtomic(manifestPath, args.subjectManifest);

    for (const [locale, messages] of Object.entries(args.subjectMessagesByLocale ?? {})) {
        const subjectMessagesPath = getDraftSubjectMessagesPath(
            locale,
            args.subjectSlug,
        );
        await writeJsonAtomic(subjectMessagesPath, messages);
    }

    return { manifestPath };
}
