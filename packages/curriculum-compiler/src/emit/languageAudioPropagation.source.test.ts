import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relative: string) {
    return fs.readFileSync(
        path.join(process.cwd(), relative),
        "utf8",
    );
}

describe("language audio propagation", () => {
    it("keeps audio typed from authoring through manifest/runtime", () => {
        const draft = read(
            "packages/curriculum-contracts/src/topic-authoring-draft.ts",
        );

        const manifest = read(
            "packages/curriculum-contracts/src/manifest.ts",
        );

        const workspace = read(
            "packages/learner-workspace/src/contracts/manifestTypes.ts",
        );

        const emitter = read(
            "packages/curriculum-compiler/src/emit/buildTopicBundleFromDraft.ts",
        );

        const compatRuntime = read(
            "packages/curriculum-runtime/src/compat/buildSketchesFromManifest.ts",
        );

        const genericRuntime = read(
            "packages/curriculum-runtime/src/sketches/buildSketchesFromManifest.ts",
        );

        expect(draft).toContain(
            "audio?: LanguageAudioSpec",
        );

        expect(draft).toContain(
            "audio: languageAudioSchema",
        );

        expect(draft).toContain(
            "assertLanguageAudioSpec(block.audio)",
        );

        expect(manifest).toContain(
            "audio?: LanguageAudioSpec",
        );

        expect(workspace).toContain(
            "audio?: LanguageAudioSpec",
        );

        expect(emitter).toContain(
            "block.audio ? { audio: block.audio } : {}",
        );

        expect(compatRuntime).toContain(
            "sketch.audio ? { audio: sketch.audio } : {}",
        );

        expect(genericRuntime).toContain(
            "sketch.audio ? { audio: sketch.audio } : {}",
        );
    });
});
