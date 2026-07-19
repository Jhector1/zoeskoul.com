import { describe, expect, it } from "vitest";
import { mergeSubjectCardPresentation } from "./subjectCardPresentation";

const authored = {
    slug: "python-v2",
    title: "Python for Beginners",
    description: "Start with the first line of Python.",
    imagePublicId: null,
    imageAlt: null,
    defaultModuleSlug: "python-v2-module-0",
    status: "active" as const,
};

describe("mergeSubjectCardPresentation", () => {
    it("uses the persisted cover when the manifest has not authored one", () => {
        const result = mergeSubjectCardPresentation(authored, {
            title: "Database title",
            description: "Database description",
            imagePublicId: "python_cover_from_db",
            imageAlt: "Python course cover",
            defaultModuleSlug: "database-module",
        });

        expect(result).toMatchObject({
            title: authored.title,
            description: authored.description,
            imagePublicId: "python_cover_from_db",
            imageAlt: "Python course cover",
            defaultModuleSlug: authored.defaultModuleSlug,
        });
    });

    it("keeps authored presentation values ahead of Prisma fallbacks", () => {
        const result = mergeSubjectCardPresentation(
            {
                ...authored,
                imagePublicId: "manifest_cover",
                imageAlt: "Manifest cover",
            },
            {
                title: "Database title",
                description: "Database description",
                imagePublicId: "database_cover",
                imageAlt: "Database cover",
                defaultModuleSlug: "database-module",
            },
        );

        expect(result.imagePublicId).toBe("manifest_cover");
        expect(result.imageAlt).toBe("Manifest cover");
    });

    it("falls back to the persisted first module when the manifest has none", () => {
        const result = mergeSubjectCardPresentation(
            { ...authored, defaultModuleSlug: null },
            {
                title: null,
                description: null,
                imagePublicId: null,
                imageAlt: null,
                defaultModuleSlug: "persisted-first-module",
            },
        );

        expect(result.defaultModuleSlug).toBe("persisted-first-module");
    });
});
