import "server-only";
import { prisma } from "@/lib/prisma";
import { DISCOVERY_HIDDEN_META_KEY, isDiscoveryHidden } from "@zoeskoul/db";

export type DiscoveryHidden = { catalogs: ReadonlySet<string>; courses: ReadonlySet<string> };
export type DiscoveryKind = "catalog" | "course";

/** Read existing course/catalog meta; never consult the retired override table. */
export async function getHiddenDiscovery(): Promise<DiscoveryHidden> {
    const [catalogs, courses] = await Promise.all([
        prisma.practiceCatalog.findMany({ select: { slug: true, meta: true } }),
        prisma.practiceSubject.findMany({ select: { slug: true, meta: true } }),
    ]);
    return {
        catalogs: new Set(catalogs.filter((row) => isDiscoveryHidden(row.meta)).map((row) => row.slug)),
        courses: new Set(courses.filter((row) => isDiscoveryHidden(row.meta)).map((row) => row.slug)),
    };
}

/** Update only the reserved JSON key, atomically: do not overwrite other meta fields.
 * The fixed table names and parameterized key/value prevent SQL injection.
 * Returns false for an unseeded record or a non-object meta value.
 */
export async function setHiddenDiscovery(kind: DiscoveryKind, slug: string, hidden: boolean): Promise<boolean> {
    const changed = kind === "catalog"
        ? await prisma.$executeRaw`
            UPDATE "PracticeCatalog"
            SET "meta" = jsonb_set(COALESCE("meta", '{}'::jsonb), ARRAY[${DISCOVERY_HIDDEN_META_KEY}]::text[], to_jsonb(${hidden}::boolean), true),
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "slug" = ${slug} AND ("meta" IS NULL OR jsonb_typeof("meta") = 'object')
          `
        : await prisma.$executeRaw`
            UPDATE "PracticeSubject"
            SET "meta" = jsonb_set(COALESCE("meta", '{}'::jsonb), ARRAY[${DISCOVERY_HIDDEN_META_KEY}]::text[], to_jsonb(${hidden}::boolean), true),
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "slug" = ${slug} AND ("meta" IS NULL OR jsonb_typeof("meta") = 'object')
          `;
    return changed === 1;
}
