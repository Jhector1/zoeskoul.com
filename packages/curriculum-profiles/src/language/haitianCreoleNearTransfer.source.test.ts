import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(
    process.cwd(),
    "authoring/subjects/haitian-creole/courses/" +
        "haitian-creole-foundations/content",
);

type Json = Record<string, any>;

function jsonFiles(dir: string): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const absolute = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                return jsonFiles(absolute);
            }

            return entry.name.endsWith(".json")
                ? [absolute]
                : [];
        });
}

function visit(
    value: unknown,
    fn: (
        value: unknown,
        key: string | null,
        at: string,
    ) => void,
    key: string | null = null,
    at = "$",
) {
    fn(value, key, at);

    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            visit(
                item,
                fn,
                key,
                `${at}[${index}]`,
            ),
        );
        return;
    }

    if (
        value &&
        typeof value === "object"
    ) {
        for (
            const [childKey, child]
            of Object.entries(
                value as Record<string, unknown>,
            )
        ) {
            visit(
                child,
                fn,
                childKey,
                `${at}.${childKey}`,
            );
        }
    }
}

function normalize(value: string): string {
    return value
        .normalize("NFKC")
        .replace(/[“”"'`*_.,!?;:()[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("ht");
}

function boldExamples(
    markdown: string,
): string[] {
    return [
        ...markdown.matchAll(
            /\*\*([^*\n]+)\*\*/g,
        ),
    ]
        .map((match) => match[1]?.trim() ?? "")
        .filter(Boolean);
}

function collectAnswerCandidates(
    exercise: Json,
): string[] {
    const out = new Set<string>();

    const directKeys = new Set([
        "targetText",
        "ttsText",
        "answer",
        "expectedText",
        "correctAnswer",
        "solution",
        "solutionText",
    ]);

    visit(
        exercise,
        (value, key) => {
            if (
                typeof value === "string" &&
                key &&
                directKeys.has(key)
            ) {
                out.add(value);
            }

            if (
                key === "expected" &&
                typeof value === "string"
            ) {
                out.add(value);
            }

            if (
                key === "expected" &&
                value &&
                typeof value === "object"
            ) {
                visit(
                    value,
                    (candidate, expectedKey) => {
                        if (
                            typeof candidate === "string" &&
                            expectedKey !== "kind" &&
                            expectedKey !== "locale"
                        ) {
                            out.add(candidate);
                        }
                    },
                );
            }
        },
    );

    return [...out];
}

function exerciseIndex(rootValue: Json) {
    const byId = new Map<string, Json>();

    visit(rootValue, (value) => {
        if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            const obj = value as Json;

            if (
                typeof obj.id === "string"
            ) {
                byId.set(obj.id, obj);
            }
        }
    });

    return byId;
}

function attachedExercises(
    block: Json,
    byId: Map<string, Json>,
): Json[] {
    const out: Json[] = [];

    if (
        Array.isArray(
            block.tryItExercises,
        )
    ) {
        for (
            const exercise
            of block.tryItExercises
        ) {
            if (
                exercise &&
                typeof exercise === "object"
            ) {
                out.push(exercise);
            }
        }
    }

    if (
        Array.isArray(
            block.tryItExerciseIds,
        )
    ) {
        for (
            const id
            of block.tryItExerciseIds
        ) {
            if (
                typeof id === "string" &&
                byId.has(id)
            ) {
                out.push(
                    byId.get(id)!,
                );
            }
        }
    }

    if (
        block.tryIt &&
        typeof block.tryIt === "object"
    ) {
        out.push(block.tryIt);
    }

    return [
        ...new Set(out),
    ];
}

describe(
    "Haitian Creole learner copy and near-transfer",
    () => {
        it(
            "does not expose the internal word sketch to learners",
            () => {
                const violations: string[] = [];

                const learnerKeys = new Set([
                    "title",
                    "prompt",
                    "hint",
                    "concept",
                    "hint_1",
                    "hint_2",
                    "instruction",
                    "instructions",
                ]);

                for (
                    const file
                    of jsonFiles(root)
                ) {
                    const json =
                        JSON.parse(
                            fs.readFileSync(
                                file,
                                "utf8",
                            ),
                        );

                    visit(
                        json,
                        (value, key, at) => {
                            if (
                                typeof value === "string" &&
                                key &&
                                learnerKeys.has(key) &&
                                /\bsketch\b/i.test(
                                    value,
                                )
                            ) {
                                violations.push(
                                    `${path.relative(
                                        process.cwd(),
                                        file,
                                    )} ${at}: ${value}`,
                                );
                            }
                        },
                    );
                }

                expect(
                    violations,
                    violations.join("\n"),
                ).toEqual([]);
            },
        );

        it(
            "does not copy a lesson example verbatim into its attached Try It answer",
            () => {
                const violations: string[] = [];

                for (
                    const file
                    of jsonFiles(root)
                ) {
                    const json =
                        JSON.parse(
                            fs.readFileSync(
                                file,
                                "utf8",
                            ),
                        );

                    const byId =
                        exerciseIndex(json);

                    const blocks =
                        Array.isArray(
                            json.sketchBlocks,
                        )
                            ? json.sketchBlocks
                            : [];

                    blocks.forEach(
                        (
                            block: Json,
                            blockIndex: number,
                        ) => {
                            if (
                                !block ||
                                typeof block !==
                                    "object"
                            ) {
                                return;
                            }

                            const body =
                                typeof block.bodyMarkdown ===
                                "string"
                                    ? block.bodyMarkdown
                                    : "";

                            const examples =
                                new Set(
                                    boldExamples(body)
                                        .map(normalize)
                                        .filter(Boolean),
                                );

                            if (
                                examples.size === 0
                            ) {
                                return;
                            }

                            for (
                                const exercise
                                of attachedExercises(
                                    block,
                                    byId,
                                )
                            ) {
                                const answers =
                                    collectAnswerCandidates(
                                        exercise,
                                    );

                                for (
                                    const answer
                                    of answers
                                ) {
                                    const normalized =
                                        normalize(answer);

                                    if (
                                        normalized &&
                                        examples.has(
                                            normalized,
                                        )
                                    ) {
                                        violations.push(
                                            `${path.relative(
                                                process.cwd(),
                                                file,
                                            )} ` +
                                            `sketchBlocks[${blockIndex}] ` +
                                            `exercise=${
                                                exercise.id ??
                                                "embedded"
                                            } ` +
                                            `copies=${JSON.stringify(
                                                answer,
                                            )}`,
                                        );
                                    }
                                }
                            }
                        },
                    );
                }

                expect(
                    violations,
                    violations.join("\n"),
                ).toEqual([]);
            },
        );
    },
);
