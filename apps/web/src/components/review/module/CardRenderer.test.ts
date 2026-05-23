import { describe, expect, it } from "vitest";

import { buildQuizBlockRuntimeDefaultsProps } from "./runtime/cardRuntimeDefaults";

describe("buildQuizBlockRuntimeDefaultsProps", () => {
    it("forwards module runtime defaults into the quiz render path", () => {
        const runtimeDefaults = {
            kind: "sql",
            datasetId: "students_intro",
            showErd: true,
            showChen: true,
        };

        expect(
            buildQuizBlockRuntimeDefaultsProps({
                moduleRuntimeDefaults: runtimeDefaults,
            }),
        ).toMatchObject({
            moduleRuntimeDefaults: runtimeDefaults,
            topicRuntimeDefaults: null,
        });
    });
});
