import {
    decodeWavPcm16Mono,
    encodeWavPcm16Mono,
    stitchNarrationWav,
} from "./narrationWav";

import {
    describe,
    expect,
    it,
} from "vitest";

describe("continuous narration WAV", () => {
    it("round-trips PCM16 mono WAV", () => {
        const pcm = Buffer.from([0, 0, 1, 0, 2, 0, 3, 0]);
        const wav = encodeWavPcm16Mono(pcm, 24000);
        const decoded = decodeWavPcm16Mono(wav);

        expect(decoded.sampleRate).toBe(24000);
        expect(decoded.pcm).toEqual(pcm);
    });

    it("stitches clips and authored silence into one WAV", () => {
        const first = {
            pcm: Buffer.from([1, 0, 2, 0]),
            sampleRate: 1000,
        };
        const second = {
            pcm: Buffer.from([3, 0, 4, 0]),
            sampleRate: 1000,
        };

        const wav = stitchNarrationWav({
            clips: [first, second],
            pausesMs: [100, 0],
        });
        const decoded = decodeWavPcm16Mono(wav);

        // 2 samples + 100 silence samples + 2 samples, 2 bytes/sample.
        expect(decoded.pcm.length).toBe(208);
        expect(decoded.pcm.subarray(0, 4)).toEqual(first.pcm);
        expect(decoded.pcm.subarray(-4)).toEqual(second.pcm);
    });
});
