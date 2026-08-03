import { describe, expect, it } from "vitest";

import { buildWebPreviewSrcDoc } from "./WebPreview";

describe("buildWebPreviewSrcDoc", () => {
    it("inlines binary image and font assets without decoding them as text", () => {
        const html = buildWebPreviewSrcDoc([
            {
                kind: "file",
                path: "site/index.html",
                content:
                    '<link rel="stylesheet" href="styles/app.css"><img src="assets/pixel.png"><video poster="assets/pixel.png"></video>',
            },
            {
                kind: "file",
                path: "site/styles/app.css",
                content:
                    '@font-face{font-family:Demo;src:url("../assets/demo.woff2")} body{background:url(../assets/pixel.png)}',
            },
            {
                kind: "file",
                path: "site/assets/pixel.png",
                encoding: "base64",
                data: "AAECAw==",
                mimeType: "image/png",
                sizeBytes: 4,
            },
            {
                kind: "file",
                path: "site/assets/demo.woff2",
                encoding: "base64",
                data: "BAUGBw==",
                mimeType: "font/woff2",
                sizeBytes: 4,
            },
        ]);

        expect(html).toContain("data:image/png;base64,AAECAw==");
        expect(html).toContain("data:font/woff2;base64,BAUGBw==");
        expect(html).not.toContain('href="styles/app.css"');
    });

    it("turns editable SVG text into a previewable data URL", () => {
        const html = buildWebPreviewSrcDoc([
            {
                kind: "file",
                path: "index.html",
                content: '<img src="assets/logo.svg?v=1">',
            },
            {
                kind: "file",
                path: "assets/logo.svg",
                content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            },
        ]);

        expect(html).toContain("data:image/svg+xml;charset=utf-8,");
        expect(html).not.toContain('src="assets/logo.svg?v=1"');
    });
});
