import { describe, expect, it } from "vitest";

import { resolveTopicStageRuntimeDefaults } from "../runtime/topicStageRuntimeDefaults";

describe("resolveTopicStageRuntimeDefaults", () => {
    it("includes module runtime defaults on the topic stage", () => {
        const runtimeDefaults = {
            kind: "sql",
            datasetId: "students_intro",
            showErd: true,
            showChen: true,
        };

        const resolved = resolveTopicStageRuntimeDefaults({
            mod: {
                id: "sql-module-0",
                title: "SQL Foundations",
                startPracticeSectionSlug: "section-0",
                runtimeDefaults,
                topics: [
                    {
                        id: "what_sql_means",
                        label: "What SQL means",
                        cards: [],
                    },
                ],
                sections: [
                    {
                        id: "section-0",
                        slug: "section-0",
                        title: "Start",
                        order: 0,
                        topics: [
                            {
                                id: "what_sql_means",
                                label: "What SQL means",
                                cards: [],
                            },
                        ],
                    },
                ],
            } as any,
            viewTopic: {
                id: "what_sql_means",
                label: "What SQL means",
                cards: [],
            } as any,
            routeSectionSlug: "section-0",
        });

        expect(resolved.moduleRuntimeDefaults).toBe(runtimeDefaults);
    });
});
