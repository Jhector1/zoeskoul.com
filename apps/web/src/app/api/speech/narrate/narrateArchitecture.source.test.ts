import fs from "node:fs";
import path from "node:path";

import {
    describe,
    expect,
    it,
} from "vitest";

const route = fs.readFileSync(
    path.join(
        process.cwd(),
        "apps/web/src/app/api/speech/narrate/route.ts",
    ),
    "utf8",
);

describe("card-level bilingual narration architecture", () => {
    it("routes Haitian Creole through explicit ht-HT Gemini TTS when available", () => {
        expect(route).toContain('return "ht-HT"');
        expect(route).toContain('"gemini-2.5-flash-tts"');
        expect(route).toContain('"LINEAR16"');
        expect(route).toContain('"Kore"');
        expect(route).toContain("createSign");
        expect(route).toContain("oauth2.googleapis.com/token");
        expect(route).not.toContain("google-auth-library");
    });

    it("never mixes providers inside one narration card", () => {
        expect(route).toContain("falling back to OpenAI for the whole narration");
        expect(route).toContain("synthesizeOpenAiCard");
        expect(route).toContain("synthesizeGoogleCard");
    });

    it("returns exactly one stitched WAV to the browser", () => {
        expect(route).toContain("stitchNarrationWav");
        expect(route).toContain('"Content-Type": "audio/wav"');
    });
});
