import { describe, expect, it } from "vitest";

import { buildWebPreviewSrcDoc } from "./WebPreview";

type WebPreviewEntries = Parameters<typeof buildWebPreviewSrcDoc>[0];

describe("WebPreview virtual workspace fetch", () => {
    it("serves relative JSON workspace files through fetch", () => {
        const html = buildWebPreviewSrcDoc(
            [
                {
                    kind: "file",
                    path: "index.html",
                    content:
                        '<script src="script.js" defer></script>',
                },
                {
                    kind: "file",
                    path: "script.js",
                    content:
                        'fetch("./data/events.json").then((response) => response.json());',
                },
                {
                    kind: "file",
                    path: "data/events.json",
                    content: '[{"name":"Robotics Lab"}]',
                },
            ] as WebPreviewEntries,
            "index.html",
            { bridgeId: "test-bridge" },
        );

        expect(html).toContain("zoeskoulVirtualWorkspaceFetch");
        expect(html).toContain('"data/events.json"');
        expect(html).toContain("application/json; charset=utf-8");
        expect(html).toContain("new Response(");

        const bridgeIndex = html.indexOf("zoeskoulVirtualWorkspaceFetch");
        const learnerIndex = html.indexOf('fetch("./data/events.json")');

        expect(bridgeIndex).toBeGreaterThanOrEqual(0);
        expect(learnerIndex).toBeGreaterThan(bridgeIndex);
    });

    it("resolves relative fetch paths from the active virtual html document", () => {
        const html = buildWebPreviewSrcDoc(
            [
                {
                    kind: "file",
                    path: "pages/demo.html",
                    content:
                        '<script src="../scripts/demo.js" defer></script>',
                },
                {
                    kind: "file",
                    path: "scripts/demo.js",
                    content:
                        'fetch("../data/items.json").then((response) => response.json());',
                },
                {
                    kind: "file",
                    path: "data/items.json",
                    content: '[1,2,3]',
                },
            ] as WebPreviewEntries,
            "pages/demo.html",
            { bridgeId: "test-bridge" },
        );

        expect(html).toContain('"pages/demo.html"');
        expect(html).toContain('"data/items.json"');
        expect(html).toContain("resolveVirtualPath");
    });

    it("returns an HTTP-like 404 Response for missing relative workspace files", () => {
        const html = buildWebPreviewSrcDoc(
            [
                {
                    kind: "file",
                    path: "index.html",
                    content:
                        '<script src="script.js" defer></script>',
                },
                {
                    kind: "file",
                    path: "script.js",
                    content:
                        'fetch("./data/missing.json").then((response) => response.ok);',
                },
            ] as WebPreviewEntries,
            "index.html",
            { bridgeId: "test-bridge" },
        );

        expect(html).toContain("status: 404");
        expect(html).toContain('statusText: "Not Found"');
    });

    it("keeps the existing ZoeSkoul bridge ahead of learner code", () => {
        const html = buildWebPreviewSrcDoc(
            [
                {
                    kind: "file",
                    path: "index.html",
                    content:
                        '<script src="script.js" defer></script>',
                },
                {
                    kind: "file",
                    path: "script.js",
                    content: 'console.log("ready");',
                },
            ] as WebPreviewEntries,
            "index.html",
            { bridgeId: "bridge-order" },
        );

        const platformBridgeIndex = html.indexOf("bridge-order");
        const fetchBridgeIndex = html.indexOf("zoeskoulVirtualWorkspaceFetch");
        const learnerIndex = html.indexOf('console.log("ready")');

        expect(platformBridgeIndex).toBeGreaterThanOrEqual(0);
        expect(fetchBridgeIndex).toBeGreaterThan(platformBridgeIndex);
        expect(learnerIndex).toBeGreaterThan(fetchBridgeIndex);
    });
});
