import fs from "node:fs";
import path from "node:path";

import {
    describe,
    expect,
    it,
} from "vitest";

function source(relative: string) {
    return fs.readFileSync(
        path.join(
            process.cwd(),
            relative,
        ),
        "utf8",
    );
}

describe(
    "language audio player architecture",
    () => {
        it(
            "keeps useSpeak canonical in learner-workspace",
            () => {
                const shared =
                    source(
                        "packages/learner-workspace/src/language/useSpeak.ts",
                    );

                const web =
                    source(
                        "apps/web/src/components/practice/kinds/_shared/useSpeak.ts",
                    );

                const student =
                    source(
                        "apps/student/src/legacy-web/components/practice/kinds/_shared/useSpeak.ts",
                    );

                expect(shared).toContain(
                    "const response = await fetch(",
                );

                expect(shared).toContain(
                    '"/api/speech/speak"',
                );

                expect(shared).toContain(
                    "speakAndWait",
                );

                expect(shared).toContain(
                    "audio.onended",
                );

                expect(web).toContain(
                    "@zoeskoul/learner-workspace/language/useSpeak",
                );

                expect(student).toContain(
                    "@zoeskoul/learner-workspace/language/useSpeak",
                );

                expect(web).not.toContain(
                    '"/api/speech/speak"',
                );

                expect(web).not.toContain(
                    "await fetch(",
                );

                expect(
                    student,
                ).not.toContain(
                    '"/api/speech/speak"',
                );

                expect(
                    student,
                ).not.toContain(
                    "await fetch(",
                );
            },
        );

        it(
            "uses one shared language audio player in both paragraph renderers",
            () => {
                for (const file of [
                    "apps/web/src/components/sketches/_archetypes/ParagraphSketch.tsx",
                    "apps/student/src/legacy-web/components/sketches/_archetypes/ParagraphSketch.tsx",
                ]) {
                    const text =
                        source(file);

                    expect(
                        text,
                    ).toContain(
                        "@zoeskoul/learner-workspace/language/LanguageAudioPlayer",
                    );

                    expect(
                        text,
                    ).toContain(
                        'useTranslations("languageAudio")',
                    );
                }
            },
        );

        it(
            "keeps manual line replay but sends full-card narration as one request",
            () => {
                const player =
                    source(
                        "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                    );

                expect(
                    player,
                ).toContain(
                    "audio.segments",
                );

                expect(
                    player,
                ).toContain(
                    "speech.speakAndWait",
                );

                expect(
                    player,
                ).toContain(
                    "speech.speakSequenceAndWait",
                );

                expect(
                    player,
                ).toContain(
                    "turn.text",
                );

                expect(
                    player,
                ).not.toContain(
                    "audio.segments.map((segment) => segment.text).join",
                );
            },
        );
    },
);
