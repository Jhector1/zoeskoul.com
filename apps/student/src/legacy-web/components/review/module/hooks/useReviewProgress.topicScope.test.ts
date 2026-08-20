import { describe, expect, it } from "vitest";

import { reviewModuleTopicIdsDependencyKey } from "./useReviewProgress";

describe("review progress topic-scope dependency", () => {
    it("uses topic values rather than caller array identity", () => {
        expect(reviewModuleTopicIdsDependencyKey([])).toBe(
            reviewModuleTopicIdsDependencyKey([]),
        );
        expect(
            reviewModuleTopicIdsDependencyKey(["topic-a", "topic-b"]),
        ).toBe(
            reviewModuleTopicIdsDependencyKey(["topic-a", "topic-b"]),
        );
        expect(
            reviewModuleTopicIdsDependencyKey(["topic-a", "topic-b"]),
        ).not.toBe(
            reviewModuleTopicIdsDependencyKey(["topic-b", "topic-a"]),
        );
    });
});
