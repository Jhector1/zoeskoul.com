import fs from "node:fs/promises";
import path from "node:path";

async function exists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function runValidateDraft(subjectSlug: string) {
    const subjectManifestPath = path.join(
        ".curriculum-drafts",
        "subjects",
        subjectSlug,
        "subject.manifest.json",
    );

    const ok = await exists(subjectManifestPath);
    if (!ok) {
        throw new Error(`Draft manifest not found for subject ${subjectSlug}`);
    }

    console.log(`Draft exists for ${subjectSlug}: ${subjectManifestPath}`);
}