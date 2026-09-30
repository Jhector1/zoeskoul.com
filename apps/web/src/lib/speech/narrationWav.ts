export type Pcm16MonoAudio = {
    pcm: Buffer;
    sampleRate: number;
};

function ascii(buffer: Buffer, start: number, end: number) {
    return buffer.toString("ascii", start, end);
}

export function decodeWavPcm16Mono(
    input: Buffer,
): Pcm16MonoAudio {
    if (
        input.length < 12 ||
        ascii(input, 0, 4) !== "RIFF" ||
        ascii(input, 8, 12) !== "WAVE"
    ) {
        throw new Error("Expected RIFF/WAVE audio from TTS provider.");
    }

    let offset = 12;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let audioFormat = 0;
    let pcm: Buffer | null = null;

    while (offset + 8 <= input.length) {
        const id = ascii(input, offset, offset + 4);
        const size = input.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        const dataEnd = Math.min(
            input.length,
            dataStart + size,
        );

        if (id === "fmt " && size >= 16) {
            audioFormat = input.readUInt16LE(dataStart);
            channels = input.readUInt16LE(dataStart + 2);
            sampleRate = input.readUInt32LE(dataStart + 4);
            bitsPerSample = input.readUInt16LE(dataStart + 14);
        } else if (id === "data") {
            pcm = input.subarray(dataStart, dataEnd);
        }

        offset = dataStart + size + (size % 2);
    }

    if (!pcm) {
        throw new Error("TTS WAV is missing a data chunk.");
    }

    if (
        audioFormat !== 1 ||
        channels !== 1 ||
        bitsPerSample !== 16 ||
        sampleRate <= 0
    ) {
        throw new Error(
            `Unsupported TTS WAV format: format=${audioFormat} channels=${channels} bits=${bitsPerSample} rate=${sampleRate}`,
        );
    }

    return {
        pcm: Buffer.from(pcm),
        sampleRate,
    };
}

export function encodeWavPcm16Mono(
    pcm: Buffer,
    sampleRate = 24000,
) {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * 2;

    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(pcm.length, 40);

    return Buffer.concat([header, pcm]);
}

export function stitchNarrationWav(args: {
    clips: ReadonlyArray<Pcm16MonoAudio>;
    pausesMs: ReadonlyArray<number>;
}) {
    if (!args.clips.length) {
        throw new Error("Narration requires at least one synthesized clip.");
    }

    const sampleRate = args.clips[0]!.sampleRate;
    const parts: Buffer[] = [];

    args.clips.forEach((clip, index) => {
        if (clip.sampleRate !== sampleRate) {
            throw new Error(
                `Narration sample-rate mismatch: ${clip.sampleRate} != ${sampleRate}`,
            );
        }

        parts.push(clip.pcm);

        if (index < args.clips.length - 1) {
            const pauseMs = Math.max(
                0,
                Math.min(
                    5000,
                    Number(args.pausesMs[index] ?? 0),
                ),
            );
            const silenceSamples = Math.round(
                sampleRate *
                    (pauseMs / 1000),
            );
            if (silenceSamples > 0) {
                parts.push(
                    Buffer.alloc(
                        silenceSamples * 2,
                    ),
                );
            }
        }
    });

    return encodeWavPcm16Mono(
        Buffer.concat(parts),
        sampleRate,
    );
}
