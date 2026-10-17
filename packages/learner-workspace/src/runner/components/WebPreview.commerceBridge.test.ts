import {
    describe,
    expect,
    it,
} from "vitest";

import {
    buildWebPreviewSrcDoc,
} from "./WebPreview";

type Entries =
    Parameters<
        typeof buildWebPreviewSrcDoc
    >[0];

describe(
    "WebPreview commerce bootstrap",
    () => {
        const entries = [
            {
                kind:
                    "file",
                path:
                    "index.html",
                content:
                    '<script src="./app.js"></script>',
            },
            {
                kind:
                    "file",
                path:
                    "app.js",
                content:
                    'globalThis.previewConfigured = Boolean(globalThis.__ZOEBUILD_COMMERCE__);',
            },
        ] as Entries;

        it(
            "installs the commerce facade before project code when enabled",
            () => {
                const html =
                    buildWebPreviewSrcDoc(
                        entries,
                        "index.html",
                        {
                            bridgeId:
                                "commerce-test",
                            commerceBridge:
                                true,
                        },
                    );

                const bridge =
                    html.indexOf(
                        "data-zoebuild-commerce-preview-bridge",
                    );
                const learner =
                    html.indexOf(
                        "globalThis.previewConfigured",
                    );

                expect(
                    bridge,
                ).toBeGreaterThan(
                    -1,
                );
                expect(
                    learner,
                ).toBeGreaterThan(
                    bridge,
                );
                expect(
                    html,
                ).toContain(
                    "__ZOEBUILD_COMMERCE__",
                );
            },
        );

        it(
            "serializes an environment-neutral commerce bootstrap",
            () => {
                const html =
                    buildWebPreviewSrcDoc(
                        entries,
                        "index.html",
                        {
                            bridgeId:
                                "commerce-test",
                            commerceBridge:
                                true,
                        },
                    );

                expect(
                    html,
                ).toContain(
                    "data-zoebuild-commerce-preview-bridge",
                );

                expect(
                    html,
                ).not.toContain(
                    '"use client"',
                );
            },
        );

        it(
            "mount-gates srcDoc so server and first client render stay deterministic",
            () => {
                const source =
                    require("node:fs").readFileSync(
                        require("node:path").resolve(
                            process.cwd(),
                            "packages/learner-workspace/src/runner/components/WebPreview.tsx",
                        ),
                        "utf8",
                    );

                expect(source).toContain("clientHydrated");
                expect(source).toContain("setClientHydrated");
                expect(source).toContain("? srcDoc");
                expect(source).toContain(': ""');
            },
        );

        it(
            "does not install commerce authority for ordinary web previews",
            () => {
                const html =
                    buildWebPreviewSrcDoc(
                        entries,
                        "index.html",
                        {
                            bridgeId:
                                "plain-test",
                        },
                    );

                expect(
                    html,
                ).not.toContain(
                    "data-zoebuild-commerce-preview-bridge",
                );
            },
        );
    },
);
