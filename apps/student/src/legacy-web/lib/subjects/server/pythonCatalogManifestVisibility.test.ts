import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SUBJECT_MANIFESTS } from "@/lib/subjects/subjects.generated";
import { selectVisibleSubjectsForActor } from "./subjectVisibilityCore";

type SubjectManifestMeta = NonNullable<
    (typeof SUBJECT_MANIFESTS)[string]["subject"]["meta"]
>;

type PythonCatalogSlug =
    | "python"
    | "python-v2"
    | "python-data-functions"
    | "applied-python-projects";

type ManifestSubjectVisibilityInput = {
    slug: string;
    enrolled: boolean;
    versioning: SubjectManifestMeta["versioning"] | null;
};
function buildVisibilityInput(
    slug: PythonCatalogSlug,
    enrolled = false,
): ManifestSubjectVisibilityInput {
    const manifest = SUBJECT_MANIFESTS[slug];

    return {
        slug,
        enrolled,
        versioning: manifest.subject.meta?.versioning ?? null,
    };
}

describe("python catalog manifest visibility", () => {
    it("keeps independent Python courses visible for new learners alongside python-v2", () => {
        const visible = selectVisibleSubjectsForActor(
            [
                buildVisibilityInput("python"),
                buildVisibilityInput("python-v2"),
                buildVisibilityInput("python-data-functions"),
                buildVisibilityInput("applied-python-projects"),
            ],
            { familyPreference: "default" },
        );

        expect(visible.map((subject) => subject.slug)).toEqual([
            "python-v2",
            "python-data-functions",
            "applied-python-projects",
        ]);
    });

    it("catalog visibility recommends python-v2 even for legacy learners", () => {
        const visible = selectVisibleSubjectsForActor(
            [
                buildVisibilityInput("python", true),
                buildVisibilityInput("python-v2"),
                buildVisibilityInput("python-data-functions"),
                buildVisibilityInput("applied-python-projects"),
            ],
            { familyPreference: "default" },
        );

        expect(visible.map((subject) => subject.slug)).toEqual([
            "python-v2",
            "python-data-functions",
            "applied-python-projects",
        ]);
    });

    it("learning visibility can still keep the enrolled legacy version", () => {
        const visible = selectVisibleSubjectsForActor([
            buildVisibilityInput("python", true),
            buildVisibilityInput("python-v2"),
            buildVisibilityInput("python-data-functions"),
            buildVisibilityInput("applied-python-projects"),
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual([
            "python",
            "python-data-functions",
            "applied-python-projects",
        ]);
    });
});
