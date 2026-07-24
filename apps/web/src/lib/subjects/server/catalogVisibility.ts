import "server-only";

import { auth } from "@/lib/auth";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import {
    getResolvedCatalogBySlug,
    getResolvedCatalogMap,
    getResolvedSubjectCardMap,
    type ResolvedCatalogItem,
    type ResolvedCatalogSubjectItem,
} from "@/lib/subjects/server/resolveSubjectPresentation";
import {
    withSubjectCardState,
    type SubjectDatabaseStateFields,
} from "@/lib/subjects/server/subjectVisibility";
import type { SubjectCardPresentation } from "@/lib/subjects/subjectCardPresentation";
import {
    selectCatalogSubjectsForMode,
    selectPublicCatalogSubjects,
    type CatalogVisibilityMode,
} from "@/lib/subjects/server/catalogVisibilityCore";

export type CatalogActorAccess = {
    mode: CatalogVisibilityMode;
    roles: string[];
    canSeeAllCatalogSubjects: boolean;
};

export type CatalogSubjectWithAvailability<T> = T &
    SubjectDatabaseStateFields & {
    availabilityStatus: "seeded" | "unseeded";
};

export type VisibleCatalogSubject =
    CatalogSubjectWithAvailability<ResolvedCatalogSubjectItem>;

export type VisibleSubjectCard =
    CatalogSubjectWithAvailability<ResolvedCatalogSubjectItem>;

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
    const isAdmin = access.isAdmin;

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
    subject: T & SubjectDatabaseStateFields,
): T & SubjectDatabaseStateFields & {
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

export async function selectCatalogSubjectsForActor<
    T extends SubjectCardPresentation,
>(
    subjects: readonly T[],
    actorAccess?: CatalogActorAccess,
): Promise<Array<CatalogSubjectWithAvailability<T>>> {
    const access = actorAccess ?? (await getCatalogActorAccess());
    const subjectsWithState = await withSubjectCardState(subjects);

    const selected = selectPublicCatalogSubjects(
        selectCatalogSubjectsForMode(subjectsWithState, access.mode),
    );

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

export async function getEnrolledVisibleSubjectCardsForActor(): Promise<
    VisibleSubjectCard[]
> {
    const subjectMap = await getResolvedSubjectCardMap();
    const subjectsWithState = await withSubjectCardState(
        Object.values(subjectMap),
    );

    return subjectsWithState
        .filter((subject) => {
            const lifecycleStatus = subject.versioning?.status;

            return (
                subject.enrolled &&
                subject.status !== "disabled" &&
                lifecycleStatus !== "draft" &&
                lifecycleStatus !== "disabled"
            );
        })
        .sort(
            (left, right) =>
                (left.subjectOrder ?? Number.MAX_SAFE_INTEGER) -
                (right.subjectOrder ?? Number.MAX_SAFE_INTEGER),
        )
        .map((subject) => withAvailabilityStatus(subject));
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

    // Public catalog routes do not render private-only or empty catalog shells.
    // Administrative diagnostics belong in the administration workspace.
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

    if (subjects.length === 0) {
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