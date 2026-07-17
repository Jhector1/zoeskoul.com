import { describe, expect, it } from "vitest";
import {
    mergeToolPresentationOverrideMaps,
    mergeToolPresentationPolicies,
    normalizeToolPresentationPolicy,
    resolveToolPresentationForLayout,
    validateToolPresentationPolicy,
} from "./tool-presentation.js";

describe("ToolPresentationPolicy", () => {
    it("inherits property-by-property through sparse curriculum scopes", () => {
        const resolved = mergeToolPresentationPolicies(
            {
                defaultVisible: true,
                defaultSurface: "editor",
                sqlPane: { showTables: true, showErd: true, showChen: false },
            },
            { sqlPane: { defaultTab: "tables" } },
            { defaultSurface: "results" },
            { sqlPane: { defaultTab: "erd" } },
        );

        expect(resolved).toEqual({
            defaultVisible: true,
            defaultSurface: "results",
            sqlPane: {
                showTables: true,
                showErd: true,
                showChen: false,
                defaultTab: "erd",
            },
        });
    });

    it("merges sparse lesson override maps per lesson and property", () => {
        expect(
            mergeToolPresentationOverrideMaps(
                {
                    sketch0: {
                        defaultSurface: "results",
                        sqlPane: { defaultTab: "tables", showTables: true },
                    },
                },
                {
                    sketch0: { sqlPane: { defaultTab: "erd", showErd: true } },
                    quiz: { defaultVisible: false },
                },
            ),
        ).toEqual({
            sketch0: {
                defaultSurface: "results",
                sqlPane: {
                    defaultTab: "erd",
                    showTables: true,
                    showErd: true,
                },
            },
            quiz: { defaultVisible: false },
        });
    });

    it("resolves compact surface and tab without losing desktop policy", () => {
        expect(
            resolveToolPresentationForLayout({
                compact: true,
                policy: {
                    defaultSurface: "results",
                    compactDefaultSurface: "results",
                    sqlPane: {
                        defaultTab: "erd",
                        compactDefaultTab: "results",
                        showErd: true,
                    },
                },
            }),
        ).toMatchObject({
            defaultSurface: "results",
            compactDefaultSurface: "results",
            sqlPane: {
                defaultTab: "results",
                compactDefaultTab: "results",
                showErd: true,
            },
        });
    });

    it("normalizes unknown manifest input into the canonical typed policy", () => {
        expect(
            normalizeToolPresentationPolicy({
                defaultVisible: true,
                allowOpen: "yes",
                defaultSurface: "results",
                compactDefaultSurface: "workspace",
                sqlPane: {
                    showResults: true,
                    showTables: "yes",
                    defaultTab: "erd",
                    compactDefaultTab: "diagram",
                },
            }),
        ).toEqual({
            defaultVisible: true,
            defaultSurface: "results",
            sqlPane: {
                showResults: true,
                defaultTab: "erd",
            },
        });
    });

    it("rejects invalid or self-hidden defaults", () => {
        expect(
            validateToolPresentationPolicy({
                defaultSurface: "workspace",
                sqlPane: { defaultTab: "erd", showErd: false },
            }),
        ).toEqual([
            'tools.defaultSurface must be "editor" or "results"',
            "tools.sqlPane.defaultTab cannot select a tab hidden by the same policy",
        ]);
    });
});
