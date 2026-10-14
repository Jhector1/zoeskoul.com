import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
    CourseBlueprint,
    CoursePlan,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import { buildTopicPreviewFromSource } from "./buildTopicPreviewFromSource";

function readJson<T>(relativePath: string): T {
    return JSON.parse(
        readFileSync(path.resolve(process.cwd(), relativePath), "utf8"),
    ) as T;
}

describe("buildTopicPreviewFromSource", () => {
    it("builds the API learner runtime entirely in memory", () => {
        const topicId = "api-requests-responses-and-endpoints";
        const result = buildTopicPreviewFromSource({
            blueprint: readJson<CourseBlueprint>(
                "authoring/subjects/api/courses/api-foundations/course.blueprint.json",
            ),
            plan: readJson<CoursePlan>(
                "authoring/subjects/api/courses/api-foundations/course.plan.json",
            ),
            topicId,
            draft: readJson<TopicAuthoringDraft>(
                `.curriculum-drafts/web/subjects/api/courses/api-foundations/topics/api-foundations-module-1-http-contracts/${topicId}.json`,
            ),
        });

        expect(result.profileId).toBe("api");
        expect(result.topicBundle.topicId).toBe(topicId);
        expect(result.topicBundle.runtimeDefaults).toMatchObject({
            language: "javascript",
            supportsTerminal: true,
        });
        expect(result.topicBundle.cards).toHaveLength(3);
        expect(result.topicBundle.exercises).toHaveLength(6);
    });
});
