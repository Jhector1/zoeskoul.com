import { describe, expectTypeOf, it } from "vitest";
import type { CourseSpec, SubjectPlan } from "./index.js";

describe("curriculum contracts", () => {
    it("requires course identity on CourseSpec", () => {
        expectTypeOf<CourseSpec>().toMatchTypeOf<{
            authoringFormatVersion: string;
            subjectSlug: string;
            courseSlug: string;
            catalogSlug: string;
            profileId: string;
            title: string;
            sourceLocale: string;
            targetLocales: string[];
            modules: unknown[];
        }>();
    });

    it("defines subject plan publish target identity", () => {
        expectTypeOf<SubjectPlan>().toMatchTypeOf<{
            subjectSlug: string;
            profileId: string;
            courseOrder: string[];
            publishTarget: {
                liveSubjectSlug: string;
                courseSlug: string;
                channel: "current" | "draft" | "preview";
            };
        }>();
    });
});
