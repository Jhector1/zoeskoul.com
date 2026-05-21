import "server-only";

import { auth } from "@/lib/auth";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import {
    getResolvedCatalogBySlug,
    getResolvedCatalogMap,
    getResolvedSubjectCardMap,
    type ResolvedCatalogItem,
    type ResolvedCatalogSubjectItem,
    type ResolvedSubjectCatalogItem,
} from "@/lib/subjects/server/resolveSubjectPresentation";
import {
    withSubjectEnrollment,
    type SubjectEnrollmentFields,
} from "@/lib/subjects/server/subjectVisibility";
import {
    selectCatalogSubjectsForMode,
    type CatalogVisibilityMode,
} from "@/lib/subjects/server/catalogVisibilityCore";

export type CatalogActorAccess = {
    mode: CatalogVisibilityMode;
    roles: string[];
    canSeeAllCatalogSubjects: boolean;
};

export type CatalogSubjectWithAvailability<T> = T &
    SubjectEnrollmentFields & {
    availabilityStatus: "seeded" | "unseeded";
};

export type VisibleCatalogSubject =
    CatalogSubjectWithAvailability<ResolvedCatalogSubjectItem>;

export type VisibleSubjectCard =
    CatalogSubjectWithAvailability<ResolvedSubjectCatalogItem>;

export type VisibleCatalog = Omit<ResolvedCatalogItem, "subjects"> & {
    subjects: VisibleCatalogSubject[];
    actorAccess: CatalogActorAccess;
};

async function getCatalogActorAccess(): Promise<CatalogActorAccess> {
    const session = await auth();

    const access = await resolvePrivilegedLearningAccess({
        userId: (session?.user as any)?.id ?? null,
        email: session?.user?.email ?? null,
    });

    const roles = access.roles ?? [];
    const isAdmin = roles.includes("admin");

    /**
     * Keep this admin-only for catalog visibility.
     * Teachers can unlock learning flow, but catalog system visibility is an
     * admin/debug concern unless you intentionally want teachers to see drafts.
     */
    const canSeeAllCatalogSubjects = isAdmin;

    return {
        mode: canSeeAllCatalogSubjects ? "admin" : "learner",
        roles,
        canSeeAllCatalogSubjects,
    };
}

function withAvailabilityStatus<T>(
    subject: T & SubjectEnrollmentFields,
): T & SubjectEnrollmentFields & {
    availabilityStatus: "seeded" | "unseeded";
} {
    return {
        ...subject,
        availabilityStatus: subject.subjectId ? "seeded" : "unseeded",
    };
}

function getCatalogDefaultSubjectSlug(
    catalogDefaultSubjectSlug: string | null | undefined,
    subjects: readonly { slug: string }[],
): string | null {
    if (
        catalogDefaultSubjectSlug &&
        subjects.some((subject) => subject.slug === catalogDefaultSubjectSlug)
    ) {
        return catalogDefaultSubjectSlug;
    }

    return subjects[0]?.slug ?? null;
}

export async function selectCatalogSubjectsForActor<T extends { slug: string }>(
    subjects: readonly T[],
    actorAccess?: CatalogActorAccess,
): Promise<Array<CatalogSubjectWithAvailability<T>>> {
    const access = actorAccess ?? (await getCatalogActorAccess());
    const subjectsWithEnrollment = await withSubjectEnrollment(subjects);

    const selected =
        access.mode === "admin"
            ? subjectsWithEnrollment
            : selectCatalogSubjectsForMode(subjectsWithEnrollment, "learner");

    return selected.map(
        (subject): CatalogSubjectWithAvailability<T> =>
            withAvailabilityStatus(subject),
    );
}

export async function getAvailableVisibleSubjectCardsForActor(): Promise<
    VisibleSubjectCard[]
> {
    const actorAccess = await getCatalogActorAccess();
    const subjectMap = await getResolvedSubjectCardMap();

    return selectCatalogSubjectsForActor(
        Object.values(subjectMap),
        actorAccess,
    );
}

export async function getAvailableVisibleCatalogsForActor(): Promise<
    VisibleCatalog[]
> {
    const actorAccess = await getCatalogActorAccess();

    const rawCatalogs = Object.values(await getResolvedCatalogMap()).filter(
        (catalog) =>
            actorAccess.canSeeAllCatalogSubjects || catalog.status !== "disabled",
    );

    const catalogs = await Promise.all(
        rawCatalogs.map(async (catalog): Promise<VisibleCatalog> => {
            const subjects = await selectCatalogSubjectsForActor(
                catalog.subjects,
                actorAccess,
            );

            return {
                ...catalog,
                subjects,
                actorAccess,
                defaultSubjectSlug: getCatalogDefaultSubjectSlug(
                    catalog.defaultSubjectSlug,
                    subjects,
                ),
            };
        }),
    );

    /**
     * Learner: hide empty catalogs.
     * Admin: keep catalogs even if empty, because admin should be able to inspect
     * catalog config drift.
     */
    if (actorAccess.canSeeAllCatalogSubjects) {
        return catalogs;
    }

    return catalogs.filter((catalog) => catalog.subjects.length > 0);
}

export async function getAvailableVisibleCatalogForActor(
    catalogSlug: string,
): Promise<VisibleCatalog | null> {
    const actorAccess = await getCatalogActorAccess();

    const catalog = await getResolvedCatalogBySlug(catalogSlug);

    if (!catalog) {
        return null;
    }

    if (catalog.status === "disabled" && !actorAccess.canSeeAllCatalogSubjects) {
        return null;
    }

    const subjects = await selectCatalogSubjectsForActor(
        catalog.subjects,
        actorAccess,
    );

    if (subjects.length === 0 && !actorAccess.canSeeAllCatalogSubjects) {
        return null;
    }

    return {
        ...catalog,
        subjects,
        actorAccess,
        defaultSubjectSlug: getCatalogDefaultSubjectSlug(
            catalog.defaultSubjectSlug,
            subjects,
        ),
    };
}