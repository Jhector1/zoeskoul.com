import {
    describe,
    expect,
    it,
} from "vitest";

import type {
    WorkspaceSyncEntry,
} from "@zoeskoul/learner-workspace/runner/runtime";

import {
    buildWebPreviewSrcDoc,
} from "./WebPreview";

type Entries =
    WorkspaceSyncEntry[];

function importMapOf(
    html: string,
) {
    const match =
        html.match(
            /<script type="importmap">([\s\S]*?)<\/script>/,
        );

    expect(match).not.toBeNull();

    return JSON.parse(
        match?.[1] ?? "{}",
    ) as {
        imports:
            Record<
                string,
                string
            >;
    };
}

function decodeModule(
    url: string,
) {
    const prefix =
        "data:text/javascript;charset=utf-8,";

    expect(
        url.startsWith(prefix),
    ).toBe(true);

    return decodeURIComponent(
        url.slice(
            prefix.length,
        ),
    );
}

describe(
    "WebPreview local ES module transport",
    () => {
        it(
            "rewrites a static storefront-style module graph to virtual import-map specifiers",
            () => {
                const html =
                    buildWebPreviewSrcDoc(
                        [
                            {
                                kind:
                                    "file",
                                path:
                                    "index.html",
                                content:
                                    '<script type="module" src="./src/app.js"></script>',
                            },
                            {
                                kind:
                                    "file",
                                path:
                                    "src/app.js",
                                content:
                                    'import { content } from "./design/content.js"; import { commerce } from "./commerce/provider.js"; globalThis.result = [content, commerce];',
                            },
                            {
                                kind:
                                    "file",
                                path:
                                    "src/design/content.js",
                                content:
                                    'import { label } from "../shared/label.js"; export const content = label;',
                            },
                            {
                                kind:
                                    "file",
                                path:
                                    "src/shared/label.js",
                                content:
                                    'export const label = "Atelier";',
                            },
                            {
                                kind:
                                    "file",
                                path:
                                    "src/commerce/provider.js",
                                content:
                                    "export const commerce = { ready: true };",
                            },
                        ] as Entries,
                        "index.html",
                        {
                            bridgeId:
                                "esm-test",
                        },
                    );

                expect(
                    html,
                ).toContain(
                    'type="importmap"',
                );

                expect(
                    html,
                ).toContain(
                    'from "zoebuild-workspace/src/design/content.js"',
                );

                expect(
                    html,
                ).toContain(
                    'from "zoebuild-workspace/src/commerce/provider.js"',
                );

                expect(
                    html,
                ).not.toContain(
                    'from "./design/content.js"',
                );

                const importMap =
                    importMapOf(
                        html,
                    );

                expect(
                    Object.keys(
                        importMap.imports,
                    ),
                ).toEqual(
                    expect.arrayContaining([
                        "zoebuild-workspace/src/app.js",
                        "zoebuild-workspace/src/design/content.js",
                        "zoebuild-workspace/src/shared/label.js",
                        "zoebuild-workspace/src/commerce/provider.js",
                    ]),
                );

                const contentModule =
                    decodeModule(
                        importMap.imports[
                            "zoebuild-workspace/src/design/content.js"
                        ] ?? "",
                    );

                expect(
                    contentModule,
                ).toContain(
                    'from "zoebuild-workspace/src/shared/label.js"',
                );
            },
        );

        it(
            "keeps classic workspace scripts classic while still installing the virtual import map",
            () => {
                const html =
                    buildWebPreviewSrcDoc(
                        [
                            {
                                kind:
                                    "file",
                                path:
                                    "index.html",
                                content:
                                    '<script src="./script.js"></script>',
                            },
                            {
                                kind:
                                    "file",
                                path:
                                    "script.js",
                                content:
                                    'globalThis.classicReady = true;',
                            },
                        ] as Entries,
                        "index.html",
                    );

                expect(
                    html,
                ).toContain(
                    'data-inline-src="script.js"',
                );

                expect(
                    html,
                ).toContain(
                    "globalThis.classicReady = true;",
                );
            },
        );

        it(
            "rewrites dynamic local imports but leaves external and bare imports untouched",
            () => {
                const html =
                    buildWebPreviewSrcDoc(
                        [
                            {
                                kind:
                                    "file",
                                path:
                                    "index.html",
                                content:
                                    '<script type="module" src="./src/app.js"></script>',
                            },
                            {
                                kind:
                                    "file",
                                path:
                                    "src/app.js",
                                content:
                                    'import("./lazy.js"); import "react"; import "https://example.com/external.js";',
                            },
                            {
                                kind:
                                    "file",
                                path:
                                    "src/lazy.js",
                                content:
                                    "export default 1;",
                            },
                        ] as Entries,
                        "index.html",
                    );

                expect(
                    html,
                ).toContain(
                    'import("zoebuild-workspace/src/lazy.js")',
                );

                expect(
                    html,
                ).toContain(
                    'import "react"',
                );

                expect(
                    html,
                ).toContain(
                    'import "https://example.com/external.js"',
                );
            },
        );
    },
);
