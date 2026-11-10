import { describe, expect, it } from "vitest";
import { adminLabTopicForDisplay } from "./adminLabTopicDisplayPolicy";

const MODULE = "linux-module-3-users-groups-troubleshooting";
const COURSE = "linux-files-permissions-users";

describe("admin lab topic display", () => {
    it("suggests root for the exact approved topic", () => {
        expect(adminLabTopicForDisplay({ subjectSlug: COURSE, moduleSlug: MODULE, topicId: "sudo-root-concepts" }))
            .toEqual({ moduleSlug: MODULE, topicSlug: "sudo-root-concepts" });
    });
    it("does not suggest root for a similar but wrong module", () => {
        expect(adminLabTopicForDisplay({ subjectSlug: COURSE, moduleSlug: "linux-module-4-secure-project-capstone", topicId: "sudo-root-concepts" })).toBeNull();
    });
    it("does not suggest root for a different subject", () => {
        expect(adminLabTopicForDisplay({ subjectSlug: "linux-terminal-fundamentals", moduleSlug: MODULE, topicId: "sudo-root-concepts" })).toBeNull();
    });
    it("does not grant root for other topics", () => {
        expect(adminLabTopicForDisplay({ subjectSlug: COURSE, moduleSlug: MODULE, topicId: "file-permissions-basics" })).toBeNull();
    });
    it("suggests the exact capstone module and topic", () => {
        const moduleSlug = "linux-module-4-secure-project-capstone";
        expect(adminLabTopicForDisplay({ subjectSlug: COURSE, moduleSlug, topicId: "final-capstone-secure-project" }))
            .toEqual({ moduleSlug, topicSlug: "final-capstone-secure-project" });
    });
});
