import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";

import {
    isHaitianCreoleLocale,
    resolveSpeechSynthesisDefaults,
} from "@zoeskoul/learner-workspace/language/resolveSpeechProfile";

import {
    decodeWavPcm16Mono,
    stitchNarrationWav,
    type Pcm16MonoAudio,
} from "@/lib/speech/narrationWav";
import { createBoundedAsyncCache } from "@/lib/speech/narrationMemoryCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const GOOGLE_TTS_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_OPENAI_MODEL =
    process.env.OPENAI_TTS_MODEL?.trim() ||
    "gpt-4o-mini-tts";
const DEFAULT_GOOGLE_MODEL =
    process.env.GOOGLE_CLOUD_TTS_MODEL?.trim() ||
    "gemini-2.5-flash-tts";
const FORCED_GOOGLE_VOICE =
    process.env.GOOGLE_CLOUD_TTS_VOICE?.trim() ||
    "";

const GOOGLE_VOICE_BY_OPENAI_VOICE: Record<string, string> = {
    marin: "Kore",
    cedar: "Charon",
    coral: "Leda",
    sage: "Puck",
    nova: "Aoede",
    onyx: "Orus",
    ash: "Umbriel",
    verse: "Zephyr",
};
const MAX_SEGMENTS = 64;
const MAX_SEGMENT_CHARS = 4096;
const MAX_TOTAL_CHARS = 24000;

const NARRATION_SYNTHESIS_CONCURRENCY =
    (() => {
        const parsed = Number.parseInt(
            process.env
                .LANGUAGE_AUDIO_TTS_CONCURRENCY
                ?.trim() || "6",
            10,
        );

        if (!Number.isFinite(parsed)) {
            return 6;
        }

        return Math.max(
            1,
            Math.min(8, parsed),
        );
    })();

type NarrationSegment = {
    text: string;
    locale?: string;
    voice?: string;
    speed?: number;
    instructions?: string;
    pauseMs: number;
};

type Provider = "google" | "openai";

function safeNumber(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : fallback;
}

function normalizeLocale(value: unknown) {
    const raw = String(value ?? "").trim().replace(/_/g, "-");
    if (!raw) return "en-US";
    if (isHaitianCreoleLocale(raw)) return "ht-HT";

    const language = raw.split("-")[0]?.toLowerCase();
    if (language === "en") return "en-US";
    return raw;
}

function normalizeSegments(value: unknown): NarrationSegment[] {
    if (!Array.isArray(value)) {
        throw new Error("Narration requires a segments array.");
    }
    if (value.length === 0 || value.length > MAX_SEGMENTS) {
        throw new Error(`Narration requires 1-${MAX_SEGMENTS} segments.`);
    }

    const segments = value.map((raw) => {
        const item = raw && typeof raw === "object"
            ? (raw as Record<string, unknown>)
            : {};
        const text = String(item.text ?? "").trim();
        if (!text) throw new Error("Narration segment text is required.");
        if (text.length > MAX_SEGMENT_CHARS) {
            throw new Error(`Narration segment exceeds ${MAX_SEGMENT_CHARS} characters.`);
        }

        const locale = normalizeLocale(item.locale);
        const defaults = resolveSpeechSynthesisDefaults(locale);

        return {
            text,
            locale,
            voice: String(item.voice ?? defaults.voice).trim() || defaults.voice,
            speed: Math.max(0.5, Math.min(1.5, safeNumber(item.speed, defaults.speed))),
            instructions:
                String(item.instructions ?? "").trim() || defaults.instructions,
            pauseMs: Math.max(0, Math.min(5000, safeNumber(item.pauseMs, 0))),
        };
    });

    const totalChars = segments.reduce((sum, item) => sum + item.text.length, 0);
    if (totalChars > MAX_TOTAL_CHARS) {
        throw new Error(`Narration exceeds ${MAX_TOTAL_CHARS} total characters.`);
    }

    return segments;
}

async function safeJson(response: Response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

async function mapWithConcurrency<T, R>(
    values: ReadonlyArray<T>,
    concurrency: number,
    work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    const output = new Array<R>(values.length);
    let cursor = 0;

    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, values.length)) },
        async () => {
            while (true) {
                const index = cursor;
                cursor += 1;
                if (index >= values.length) return;
                output[index] = await work(values[index]!, index);
            }
        },
    );

    await Promise.all(workers);
    return output;
}

async function synthesizeOpenAi(
    segment: NarrationSegment,
    signal: AbortSignal,
): Promise<Pcm16MonoAudio> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const response = await fetch(OPENAI_SPEECH_URL, {
        method: "POST",
        signal,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: DEFAULT_OPENAI_MODEL,
            voice: segment.voice || "marin",
            input: segment.text,
            instructions: segment.instructions,
            response_format: "wav",
            speed: segment.speed,
        }),
    });

    if (!response.ok) {
        const detail = await safeJson(response);
        throw new Error(
            detail?.error?.message ??
                detail?.message ??
                `OpenAI TTS failed (${response.status})`,
        );
    }

    return decodeWavPcm16Mono(
        Buffer.from(await response.arrayBuffer()),
    );
}

function googleVoiceName(segment: NarrationSegment) {
    if (FORCED_GOOGLE_VOICE) return FORCED_GOOGLE_VOICE;
    return GOOGLE_VOICE_BY_OPENAI_VOICE[segment.voice || "marin"] || "Kore";
}

function hasGoogleTtsConfiguration() {
    return Boolean(
        process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim() ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
    );
}

function googlePrompt(segment: NarrationSegment) {
    const segmentSpeed = segment.speed ?? 1;
    const speed =
        segmentSpeed < 0.95
            ? "Speak slightly slowly and clearly."
            : segmentSpeed > 1.05
              ? "Speak slightly briskly while staying clear."
              : "Use a natural teaching pace.";

    const localeInstruction = isHaitianCreoleLocale(segment.locale)
        ? "Use natural native Haitian Creole (Kreyòl ayisyen) pronunciation, rhythm, vowels, nasalization, and contractions. Do not anglicize or translate any word."
        : "Use natural pronunciation for the requested language. Do not translate the text.";

    return [
        localeInstruction,
        "Read exactly the supplied text and nothing else.",
        "Keep a warm, clear teacher-like delivery and the same speaker identity as the rest of this lesson.",
        speed,
        segment.instructions,
    ]
        .filter(Boolean)
        .join(" ");
}

function encodeGoogleJwtPart(value: unknown) {
    return Buffer.from(
        JSON.stringify(value),
        "utf8",
    ).toString("base64url");
}

type GoogleServiceAccountFile = {
    client_email?: unknown;
    private_key?: unknown;
    private_key_id?: unknown;
    project_id?: unknown;
};

type CachedGoogleAccess = {
    token: string;
    projectId: string;
    expiresAt: number;
};

let cachedGoogleAccess:
    | CachedGoogleAccess
    | null = null;

async function googleAccess(args: { signal: AbortSignal }) {
    /*
     * Google access tokens normally live for about an hour.
     * Reuse the token while it has at least two minutes
     * remaining instead of repeating JWT signing + OAuth
     * token exchange for every narration card.
     */
    if (
        cachedGoogleAccess &&
        cachedGoogleAccess.expiresAt >
            Date.now() + 2 * 60 * 1000
    ) {
        return {
            token:
                cachedGoogleAccess.token,
            projectId:
                cachedGoogleAccess.projectId,
        };
    }

    /*
     * Keep this flow intentionally aligned with the independently verified
     * standalone Node proof used during the narration rollout.
     *
     * Important: when GOOGLE_APPLICATION_CREDENTIALS is set, read that exact
     * file and sign with the private_key value exactly as JSON parsed it.
     * Do not trim or rewrite the PEM before signing.
     */
    const credentialPath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    const inline =
        process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim();

    let raw = "";
    if (credentialPath) {
        raw = await readFile(
            credentialPath,
            "utf8",
        );
    } else if (inline) {
        raw = inline;
    }

    if (!raw) {
        throw new Error(
            "Google TTS requires GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON.",
        );
    }

    const serviceAccount =
        JSON.parse(raw) as GoogleServiceAccountFile;

    const clientEmail =
        typeof serviceAccount.client_email === "string"
            ? serviceAccount.client_email
            : "";
    const privateKey =
        typeof serviceAccount.private_key === "string"
            ? serviceAccount.private_key
            : "";
    const privateKeyId =
        typeof serviceAccount.private_key_id === "string"
            ? serviceAccount.private_key_id
            : "";

    if (!clientEmail || !privateKey || !privateKeyId) {
        throw new Error(
            "Google service-account credentials are missing client_email, private_key, or private_key_id.",
        );
    }

    const issuedAt = Math.floor(
        Date.now() / 1000,
    );

    const header = encodeGoogleJwtPart({
        alg: "RS256",
        typ: "JWT",
        kid: privateKeyId,
    });

    const payload = encodeGoogleJwtPart({
        iss: clientEmail,
        scope:
            "https://www.googleapis.com/auth/cloud-platform",
        aud:
            "https://oauth2.googleapis.com/token",
        iat: issuedAt,
        exp: issuedAt + 3600,
    });

    const signingInput =
        `${header}.${payload}`;

    const signer =
        createSign("RSA-SHA256");

    signer.update(
        signingInput,
    );
    signer.end();

    const signature =
        signer.sign(privateKey);

    const assertion =
        `${signingInput}.${signature.toString("base64url")}`;

    const tokenResponse = await fetch(
        "https://oauth2.googleapis.com/token",
        {
            method: "POST",
            signal: args.signal,
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type:
                    "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion,
            }),
        },
    );

    const detail =
        await safeJson(tokenResponse);

    if (!tokenResponse.ok) {
        throw new Error(
            detail?.error_description ??
                detail?.error?.message ??
                detail?.message ??
                `Google OAuth token exchange failed (${tokenResponse.status})`,
        );
    }

    const token =
        String(
            detail?.access_token ?? "",
        ).trim();

    if (!token) {
        throw new Error(
            "Google OAuth token exchange returned no access token.",
        );
    }

    const projectId =
        process.env.GOOGLE_CLOUD_TTS_PROJECT_ID?.trim() ||
        process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
        (
            typeof serviceAccount.project_id === "string"
                ? serviceAccount.project_id.trim()
                : ""
        );

    if (!projectId) {
        throw new Error(
            "Unable to resolve Google Cloud project for TTS.",
        );
    }

    const rawExpiresIn =
        Number(
            detail?.expires_in ??
                3600,
        );

    const expiresInSeconds =
        Number.isFinite(
            rawExpiresIn,
        )
            ? Math.max(
                  60,
                  Math.min(
                      3600,
                      rawExpiresIn,
                  ),
              )
            : 3600;

    cachedGoogleAccess = {
        token,
        projectId,
        expiresAt:
            Date.now() +
            expiresInSeconds *
                1000,
    };

    return {
        token,
        projectId,
    };
}

async function synthesizeGoogleCard(
    segments: ReadonlyArray<NarrationSegment>,
    signal: AbortSignal,
): Promise<Pcm16MonoAudio[]> {
    const { token, projectId } = await googleAccess({ signal });
    const region = process.env.GOOGLE_CLOUD_TTS_REGION?.trim().toLowerCase() || "global";
    const host = region === "global"
        ? "texttospeech.googleapis.com"
        : `${region}-texttospeech.googleapis.com`;
    const url = `https://${host}/v1/text:synthesize`;

    return mapWithConcurrency(
        segments,
        NARRATION_SYNTHESIS_CONCURRENCY,
        async (segment) => {
        const response = await fetch(url, {
            method: "POST",
            signal,
            headers: {
                Authorization: `Bearer ${token}`,
                "x-goog-user-project": projectId,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: {
                    prompt: googlePrompt(segment),
                    text: segment.text,
                },
                voice: {
                    languageCode: segment.locale,
                    name: googleVoiceName(segment),
                    modelName: DEFAULT_GOOGLE_MODEL,
                },
                audioConfig: {
                    audioEncoding: "LINEAR16",
                    sampleRateHertz: 24000,
                },
            }),
        });

        const detail = await safeJson(response);
        if (!response.ok) {
            throw new Error(
                detail?.error?.message ??
                    detail?.message ??
                    `Google Gemini TTS failed (${response.status})`,
            );
        }

        const encoded = String(detail?.audioContent ?? "");
        if (!encoded) throw new Error("Google Gemini TTS returned no audioContent.");

        return decodeWavPcm16Mono(
            Buffer.from(encoded, "base64"),
        );
    });
}

async function synthesizeOpenAiCard(
    segments: ReadonlyArray<NarrationSegment>,
    signal: AbortSignal,
) {
    return mapWithConcurrency(
        segments,
        NARRATION_SYNTHESIS_CONCURRENCY,
        (segment) =>
            synthesizeOpenAi(
                segment,
                signal,
            ),
    );
}

function providerMode(): "auto" | Provider {
    const raw = process.env.LANGUAGE_AUDIO_TTS_PROVIDER?.trim().toLowerCase();
    if (raw === "google" || raw === "openai") return raw;
    return "auto";
}

/*
 * V140C71 NARRATION QUOTA HARDENING
 *
 * Process-local caching removes repeat provider synthesis for the
 * exact same normalized narration without Redis, DB writes, or
 * unsafe HTTP caching of a POST endpoint.
 */
type CachedNarration = {
    wav: ReturnType<
        typeof stitchNarrationWav
    >;
    provider: Provider;
    voice: string;
};

function boundedEnvInt(
    name: string,
    fallback: number,
    min: number,
    max: number,
) {
    const raw =
        process.env[name]?.trim();

    if (!raw) {
        return fallback;
    }

    const parsed =
        Number.parseInt(
            raw,
            10,
        );

    if (
        !Number.isFinite(parsed)
    ) {
        return fallback;
    }

    return Math.min(
        max,
        Math.max(
            min,
            parsed,
        ),
    );
}

const NARRATION_CACHE_MAX_ENTRIES =
    boundedEnvInt(
        "LANGUAGE_AUDIO_TTS_CACHE_MAX_ENTRIES",
        48,
        1,
        512,
    );

const NARRATION_CACHE_MAX_BYTES =
    boundedEnvInt(
        "LANGUAGE_AUDIO_TTS_CACHE_MAX_BYTES",
        64 * 1024 * 1024,
        1024 * 1024,
        512 * 1024 * 1024,
    );

const NARRATION_CACHE_TTL_MS =
    boundedEnvInt(
        "LANGUAGE_AUDIO_TTS_CACHE_TTL_MS",
        24 * 60 * 60 * 1000,
        60 * 1000,
        7 * 24 * 60 * 60 * 1000,
    );

const NARRATION_SYNTHESIS_TIMEOUT_MS =
    boundedEnvInt(
        "LANGUAGE_AUDIO_TTS_SYNTHESIS_TIMEOUT_MS",
        60 * 1000,
        5000,
        5 * 60 * 1000,
    );

const narrationCache =
    createBoundedAsyncCache<
        CachedNarration
    >({
        maxEntries:
            NARRATION_CACHE_MAX_ENTRIES,
        maxBytes:
            NARRATION_CACHE_MAX_BYTES,
        ttlMs:
            NARRATION_CACHE_TTL_MS,
        sizeOf:
            (entry) =>
                entry.wav.byteLength,
    });

function narrationCacheKey(args: {
    segments:
        ReadonlyArray<NarrationSegment>;
    mode:
        | "auto"
        | Provider;
    preferGoogle: boolean;
}) {
    return JSON.stringify({
        version:
            "v140c71",
        providerMode:
            args.mode,
        preferGoogle:
            args.preferGoogle,
        googleModel:
            DEFAULT_GOOGLE_MODEL,
        googleVoice:
            FORCED_GOOGLE_VOICE ||
            null,
        googleRegion:
            process.env
                .GOOGLE_CLOUD_TTS_REGION
                ?.trim()
                .toLowerCase() ||
            "global",
        openAiModel:
            DEFAULT_OPENAI_MODEL,
        segments:
            args.segments,
    });
}

export async function POST(req: Request) {
    let body: Record<string, unknown>;

    try {
        body =
            (await req.json()) as Record<
                string,
                unknown
            >;
    } catch {
        return NextResponse.json(
            {
                error:
                    "Expected JSON body",
            },
            {
                status: 400,
            },
        );
    }

    let segments: NarrationSegment[];

    try {
        segments =
            normalizeSegments(
                body?.segments,
            );
    } catch (cause) {
        return NextResponse.json(
            {
                error:
                    cause instanceof Error
                        ? cause.message
                        : String(cause),
            },
            {
                status: 400,
            },
        );
    }

    const pausesMs =
        segments.map(
            (item) =>
                item.pauseMs,
        );

    const hasHaitian =
        segments.some((item) =>
            isHaitianCreoleLocale(
                item.locale,
            ),
        );

    const mode =
        providerMode();

    const preferGoogle =
        mode === "google" ||
        (
            mode === "auto" &&
            hasHaitian &&
            hasGoogleTtsConfiguration()
        );

    const cacheKey =
        narrationCacheKey({
            segments,
            mode,
            preferGoogle,
        });

    if (req.signal.aborted) {
        return NextResponse.json(
            {
                error:
                    "Narration cancelled",
            },
            {
                status: 499,
            },
        );
    }

    try {
        const cached =
            await narrationCache
                .getOrCreate(
                    cacheKey,
                    async () => {
                        let provider:
                            Provider =
                            preferGoogle
                                ? "google"
                                : "openai";

                        let clips:
                            Pcm16MonoAudio[];

                        const synthesisController =
                            new AbortController();

                        const timeout =
                            setTimeout(
                                () => {
                                    synthesisController
                                        .abort();
                                },
                                NARRATION_SYNTHESIS_TIMEOUT_MS,
                            );

                        try {
                            if (
                                preferGoogle
                            ) {
                                try {
                                    clips =
                                        await synthesizeGoogleCard(
                                            segments,
                                            synthesisController.signal,
                                        );
                                } catch (
                                    googleError
                                ) {
                                    if (
                                        mode ===
                                        "google"
                                    ) {
                                        throw googleError;
                                    }

                                    provider =
                                        "openai";

                                    console.warn(
                                        "[language-audio] Gemini TTS unavailable; falling back to OpenAI for the whole narration.",
                                        googleError,
                                    );

                                    clips =
                                        await synthesizeOpenAiCard(
                                            segments,
                                            synthesisController.signal,
                                        );
                                }
                            } else {
                                clips =
                                    await synthesizeOpenAiCard(
                                        segments,
                                        synthesisController.signal,
                                    );
                            }
                        } finally {
                            clearTimeout(
                                timeout,
                            );
                        }

                        const wav =
                            stitchNarrationWav({
                                clips,
                                pausesMs,
                            });

                        const voice =
                            provider ===
                            "google"
                                ? googleVoiceName(
                                      segments[
                                          0
                                      ]!,
                                  )
                                : (
                                      segments[
                                          0
                                      ]
                                          ?.voice ||
                                      "marin"
                                  );

                        return {
                            wav,
                            provider,
                            voice,
                        };
                    },
                );

        if (
            req.signal.aborted
        ) {
            return NextResponse.json(
                {
                    error:
                        "Narration cancelled",
                },
                {
                    status: 499,
                },
            );
        }

        return new Response(
            cached.value.wav,
            {
                status: 200,
                headers: {
                    "Content-Type": "audio/wav",
                    "Cache-Control": "no-store",
                    "X-Zoe-TTS-Provider":
                        cached.value
                            .provider,
                    "X-Zoe-TTS-Voice":
                        cached.value
                            .voice,
                    "X-Zoe-TTS-Cache":
                        cached.status,
                },
            },
        );
    } catch (cause) {
        if (
            req.signal.aborted
        ) {
            return NextResponse.json(
                {
                    error:
                        "Narration cancelled",
                },
                {
                    status: 499,
                },
            );
        }

        const message =
            cause instanceof Error
                ? (
                      cause.name ===
                      "AbortError"
                  )
                    ? "Narration synthesis timed out"
                    : cause.message
                : String(cause);

        return NextResponse.json(
            {
                error:
                    "Narration TTS failed",
                message,
            },
            {
                status: 502,
            },
        );
    }
}
