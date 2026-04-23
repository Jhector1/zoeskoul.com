import fs from "node:fs/promises";
import path from "node:path";

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
    const manifestPath = `.curriculum-drafts/subjects/${args.subjectSlug}/subject.manifest.json`;

    await writeJsonAtomic(manifestPath, args.subjectManifest);

    for (const [locale, messages] of Object.entries(args.subjectMessagesByLocale ?? {})) {
        const subjectMessagesPath = `.curriculum-drafts/messages/${locale}/subjects/${args.subjectSlug}/subject.json`;
        await writeJsonAtomic(subjectMessagesPath, messages);
    }

    return { manifestPath };
}