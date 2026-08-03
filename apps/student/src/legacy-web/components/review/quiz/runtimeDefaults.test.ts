import { describe, expect, it } from "vitest";
import {
    getPracticeTopicRuntimeDefaults,
    resolveQuizPracticeRuntimeDefaults,
} from "./runtimeDefaults";

describe("getPracticeTopicRuntimeDefaults", () => {
    it("returns quiz spec runtime defaults for practice questions", () => {
        const runtime = getPracticeTopicRuntimeDefaults({
            subject: "sql-v2",
            topic: "sql.module.topic",
            runtime: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
                showChen: true,
                fixedSqlDialect: "sqlite",
                resultShape: "table",
            },
        });

        expect(runtime).toMatchObject({
            datasetId: "students_intro",
            showErd: true,
            showChen: true,
        });
    });

    it("lets quiz spec runtime override parent topic runtime while keeping module defaults", () => {
        const resolved = resolveQuizPracticeRuntimeDefaults({
            spec: {
                subject: "sql-v2",
                topic: "sql.module.topic",
                runtime: {
                    kind: "sql",
                    datasetId: "products_catalog",
                },
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
                showChen: true,
            },
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "customers_cleanup",
            },
        });

        expect(resolved).toMatchObject({
            moduleRuntimeDefaults: {
                datasetId: "students_intro",
                showErd: true,
                showChen: true,
            },
            topicRuntimeDefaults: {
                datasetId: "products_catalog",
            },
        });
    });
});
