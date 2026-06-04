import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SUBJECT_MANIFESTS } from "@/lib/subjects/subjects.generated";
import { selectVisibleSubjectsForActor } from "./subjectVisibilityCore";

type ManifestSubjectVisibilityInput = {
    slug: string;
    enrolled: boolean;
    versioning:
        | (typeof SUBJECT_MANIFESTS)[string]["subject"]["meta"]["versioning"]
        | null;
};

function buildVisibilityInput(
    slug: "python" | "python-v2" | "python-data-functions",
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
    it("keeps python-data-functions visible for new learners alongside python-v2", () => {
        const visible = selectVisibleSubjectsForActor([
            buildVisibilityInput("python"),
            buildVisibilityInput("python-v2"),
            buildVisibilityInput("python-data-functions"),
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual([
            "python-v2",
            "python-data-functions",
        ]);
    });

    it("keeps python-data-functions visible for legacy learners alongside python", () => {
        const visible = selectVisibleSubjectsForActor([
            buildVisibilityInput("python", true),
            buildVisibilityInput("python-v2"),
            buildVisibilityInput("python-data-functions"),
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual([
            "python",
            "python-data-functions",
        ]);
    });
});
