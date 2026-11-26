import { describe, expect, it } from "vitest";

import {
    resolveDepartmentHomeExperiences,
    selectDepartmentHomeSubjects,
} from "./departmentHome";

type Subject = {
    slug: string;
    departmentId: string;
    enrolled: boolean;
};

function subject(
    slug: string,
    departmentId: string,
    enrolled = false,
): Subject {
    return { slug, departmentId, enrolled };
}

describe("department-aware home presentation", () => {
    it("keeps recommendations inside the selected learner department", () => {
        const result = selectDepartmentHomeSubjects(
            [
                subject("haitian-creole-foundations", "languages"),
                subject("python-v2", "computer-science"),
                subject("sql-v2", "computer-science"),
            ],
            ["languages"],
        );

        expect(result.map((item) => item.slug)).toEqual([
            "haitian-creole-foundations",
        ]);
    });

    it("keeps an enrolled cross-department course visible without leaking other recommendations", () => {
        const result = selectDepartmentHomeSubjects(
            [
                subject("haitian-creole-foundations", "languages"),
                subject("python-v2", "computer-science", true),
                subject("sql-v2", "computer-science"),
            ],
            ["languages"],
        );

        expect(result.map((item) => item.slug)).toEqual([
            "haitian-creole-foundations",
            "python-v2",
        ]);
    });

    it("preserves the legacy Computer Science experience when no explicit department exists", () => {
        expect(resolveDepartmentHomeExperiences([])).toEqual([
            "computer-science",
        ]);
    });

    it("shows the Computer Science animation for Computer Science learners", () => {
        expect(
            resolveDepartmentHomeExperiences(["computer-science"]),
        ).toEqual(["computer-science"]);
    });

    it("shows the Languages animation for Languages learners", () => {
        expect(
            resolveDepartmentHomeExperiences(["languages"]),
        ).toEqual(["languages"]);
    });

    it("shows both animations when both departments are selected", () => {
        expect(
            resolveDepartmentHomeExperiences([
                "computer-science",
                "languages",
            ]),
        ).toEqual(["computer-science", "languages"]);
    });

    it("does not invent animations for unsupported future departments", () => {
        expect(
            resolveDepartmentHomeExperiences(["mathematics"]),
        ).toEqual([]);
        expect(
            resolveDepartmentHomeExperiences([
                "languages",
                "mathematics",
            ]),
        ).toEqual(["languages"]);
    });

    it("does not show learner department experiences for teacher-only mode", () => {
        expect(
            resolveDepartmentHomeExperiences(
                ["computer-science", "languages"],
                { learnerEnabled: false },
            ),
        ).toEqual([]);
    });
});
