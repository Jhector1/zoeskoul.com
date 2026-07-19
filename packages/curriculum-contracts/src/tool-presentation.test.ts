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
                runnerPane: { defaultTab: "output" },
                sqlPane: { showTables: true, showErd: true, showChen: false },
            },
            { runnerPane: { compactDefaultTab: "terminal" }, sqlPane: { defaultTab: "tables" } },
            { defaultSurface: "results" },
            { runnerPane: { defaultTab: "terminal" }, sqlPane: { defaultTab: "erd" } },
        );

        expect(resolved).toEqual({
            defaultVisible: true,
            defaultSurface: "results",
            runnerPane: {
                defaultTab: "terminal",
                compactDefaultTab: "terminal",
            },
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
                    runnerPane: {
                        defaultTab: "output",
                        compactDefaultTab: "terminal",
                    },
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
            runnerPane: {
                defaultTab: "terminal",
                compactDefaultTab: "terminal",
            },
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
                runnerPane: {
                    defaultTab: "terminal",
                    compactDefaultTab: "console",
                },
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
            runnerPane: {
                defaultTab: "terminal",
            },
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
                runnerPane: { defaultTab: "console" },
                sqlPane: { defaultTab: "erd", showErd: false },
            }),
        ).toEqual([
            'tools.defaultSurface must be "editor" or "results"',
            'tools.runnerPane.defaultTab must be "output" or "terminal"',
            "tools.sqlPane.defaultTab cannot select a tab hidden by the same policy",
        ]);
    });
});
