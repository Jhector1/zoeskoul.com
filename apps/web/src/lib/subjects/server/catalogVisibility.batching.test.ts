import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    resolvePrivilegedLearningAccess: vi.fn(),
    getResolvedCatalogMap: vi.fn(),
    getResolvedCatalogBySlug: vi.fn(),
    getResolvedSubjectCardMap: vi.fn(),
    withSubjectCardState: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
    auth: mocks.auth,
}));

vi.mock(
    "@/lib/access/resolvePrivilegedLearningAccess",
    () => ({
        resolvePrivilegedLearningAccess:
            mocks.resolvePrivilegedLearningAccess,
    }),
);

vi.mock(
    "@/lib/subjects/server/resolveSubjectPresentation",
    () => ({
        getResolvedCatalogMap:
            mocks.getResolvedCatalogMap,
        getResolvedCatalogBySlug:
            mocks.getResolvedCatalogBySlug,
        getResolvedSubjectCardMap:
            mocks.getResolvedSubjectCardMap,
    }),
);

vi.mock(
    "@/lib/subjects/server/subjectVisibility",
    () => ({
        withSubjectCardState:
            mocks.withSubjectCardState,
    }),
);

import {
    getAvailableVisibleCatalogsForActor,
} from "./catalogVisibility";

function subject(
    slug: string,
    family: string,
) {
    return {
        slug,
        title: slug,
        description: null,
        status: "active",
        visibility: "public",
        versioning: {
            family,
            status: "active",
            defaultForNewEnrollments: true,
        },
    };
}

describe(
    "getAvailableVisibleCatalogsForActor batching",
    () => {
        beforeEach(() => {
            vi.clearAllMocks();

            mocks.resolvePrivilegedLearningAccess
                .mockResolvedValue({
                    roles: [],
                    isAdmin: false,
                });

            mocks.getResolvedCatalogMap
                .mockResolvedValue({
                    alpha: {
                        slug: "alpha",
                        title: "Alpha",
                        description: null,
                        status: "active",
                        defaultSubjectSlug:
                            "shared",
                        subjects: [
                            subject(
                                "shared",
                                "shared",
                            ),
                            subject(
                                "alpha-only",
                                "alpha-only",
                            ),
                        ],
                    },
                    beta: {
                        slug: "beta",
                        title: "Beta",
                        description: null,
                        status: "active",
                        defaultSubjectSlug:
                            "beta-only",
                        subjects: [
                            subject(
                                "shared",
                                "shared",
                            ),
                            subject(
                                "beta-only",
                                "beta-only",
                            ),
                        ],
                    },
                });

            mocks.withSubjectCardState
                .mockImplementation(
                    async (
                        subjects: Array<{
                            slug: string;
                        }>,
                    ) =>
                        subjects.map(
                            (
                                subject,
                                index,
                            ) => ({
                                ...subject,
                                subjectId:
                                    `db_${subject.slug}`,
                                enrolled: false,
                                subjectOrder: index,
                                visibility: "public",
                            }),
                        ),
                );
        });

        it(
            "hydrates all catalog subjects once and rebuilds each catalog in place",
            async () => {
                const catalogs =
                    await getAvailableVisibleCatalogsForActor(
                        {
                            userId: "user_1",
                        },
                    );

                expect(
                    mocks.withSubjectCardState,
                ).toHaveBeenCalledTimes(1);

                const hydratedInput =
                    mocks.withSubjectCardState
                        .mock.calls[0]?.[0];

                expect(
                    hydratedInput.map(
                        (item: {
                            slug: string;
                        }) => item.slug,
                    ),
                ).toEqual([
                    "shared",
                    "alpha-only",
                    "shared",
                    "beta-only",
                ]);

                expect(
                    catalogs.map(
                        (catalog) => ({
                            slug: catalog.slug,
                            subjects:
                                catalog.subjects.map(
                                    (item) =>
                                        item.slug,
                                ),
                        }),
                    ),
                ).toEqual([
                    {
                        slug: "alpha",
                        subjects: [
                            "shared",
                            "alpha-only",
                        ],
                    },
                    {
                        slug: "beta",
                        subjects: [
                            "shared",
                            "beta-only",
                        ],
                    },
                ]);

                expect(
                    catalogs.map(
                        (catalog) =>
                            catalog.defaultSubjectSlug,
                    ),
                ).toEqual([
                    "shared",
                    "beta-only",
                ]);
            },
        );
    },
);
