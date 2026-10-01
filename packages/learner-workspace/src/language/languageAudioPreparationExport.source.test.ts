import {
    describe,
    expect,
    it,
} from "vitest";

import {
    readFileSync,
} from "node:fs";

describe(
    "language audio preparation package export",
    () => {
        it(
            "publishes the shared preparation owner through learner-workspace",
            () => {
                const packageJson =
                    JSON.parse(
                        readFileSync(
                            "packages/learner-workspace/package.json",
                            "utf8",
                        ),
                    ) as {
                        exports?: Record<
                            string,
                            string
                        >;
                    };

                expect(
                    packageJson.exports?.[
                        "./language/languageAudioPreparation"
                    ],
                ).toBe(
                    "./src/language/languageAudioPreparation.ts",
                );
            },
        );
    },
);
