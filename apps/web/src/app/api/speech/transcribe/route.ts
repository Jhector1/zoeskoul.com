// src/app/api/speech/transcribe/route.ts
import { NextResponse } from "next/server";
import { normalizeSpeechLocale, normalizePhrase } from "@/lib/speech/lang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_BYTES = 25 * 1024 * 1024;

function safeJson(s: string) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function pickOpenAiMessage(detail: any): string {
    return (
        detail?.error?.message ??
        detail?.message ??
        (typeof detail === "string" ? detail : null) ??
        "OpenAI returned an error."
    );
}

function msgLower(detail: any) {
    return pickOpenAiMessage(detail).toLowerCase();
}

function looksLikeUnsupportedLanguage(detail: any) {
    const msg = msgLower(detail);
    return msg.includes("language") && (msg.includes("unsupported") || msg.includes("not supported") || msg.includes("invalid"));
}

function looksLikeUnsupportedParam(detail: any, param: string) {
    const msg = msgLower(detail);
    // common OpenAI phrasing patterns
    return (
        msg.includes(param.toLowerCase()) &&
        (msg.includes("not supported") ||
            msg.includes("unsupported") ||
            msg.includes("unknown") ||
            msg.includes("unexpected") ||
            msg.includes("invalid") ||
            msg.includes("is not supported with this model"))
    );
}

function shouldTryNextModel(detail: any) {
    const msg = msgLower(detail);
    return (
        msg.includes("model") ||
        msg.includes("does not exist") ||
        msg.includes("do not have access") ||
        msg.includes("unsupported") ||
        msg.includes("not supported")
    );
}

async function callOpenAI(form: FormData, apiKey: string) {
    const r = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });

    const text = await r.text();
    const json = safeJson(text);
    return { ok: r.ok, status: r.status, text, json };
}

/** logprobs confidence: mean(exp(logprob)) clamped */
function confidenceFromLogprobs(logprobs?: Array<{ token?: string; logprob?: number }>) {
    if (!Array.isArray(logprobs) || !logprobs.length) return null;

    let sum = 0;
    let n = 0;
    let low = 0;

    for (const lp of logprobs) {
        const v = typeof lp?.logprob === "number" ? lp.logprob : null;
        if (v == null || !Number.isFinite(v)) continue;

        const p = Math.exp(v);
        if (Number.isFinite(p)) {
            sum += p;
            n++;
            if (p < 0.35) low++;
        }
    }

    if (n === 0) return null;
    const meanP = Math.max(0, Math.min(1, sum / n));
    return { meanP, tokens: n, lowTokens: low };
}

// Optional pin for consistency
const MODEL_PRIMARY = process.env.OPENAI_STT_MODEL_PRIMARY?.trim() || "gpt-4o-transcribe";
const MODEL_FALLBACK = process.env.OPENAI_STT_MODEL_FALLBACK?.trim() || "gpt-4o-mini-transcribe";
const MODEL_SNAPSHOT = process.env.OPENAI_STT_MODEL_SNAPSHOT?.trim() || "gpt-4o-mini-transcribe-2025-12-15";

function modelSupportsLogprobs(model: string) {
    // safest assumption: only gpt-4o* transcribe models
    return model.startsWith("gpt-4o-");
}

// We *try* chunking first for gpt-4o* models, but we will retry without if rejected.
function modelTryChunkingFirst(model: string) {
    return model.startsWith("gpt-4o-");
}

async function attemptOnce(args: {
    apiKey: string;
    model: string;
    file: File;
    prompt: string;
    language: string; // "" => omit
    useChunking: boolean;
    useLogprobs: boolean;
}) {
    const { apiKey, model, file, prompt, language, useChunking, useLogprobs } = args;

    const out = new FormData();
    out.append("file", file, file.name || "audio.webm");
    out.append("model", model);

    out.append("response_format", "json");
    out.append("temperature", "0");

    if (useChunking) out.append("chunking_strategy", "auto");
    if (useLogprobs) out.append("include[]", "logprobs");
    if (language) out.append("language", language);
    if (prompt) out.append("prompt", prompt);

    return callOpenAI(out, apiKey);
}

export async function POST(req: Request) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    const incoming = await req.formData();

    const file = incoming.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json(
            { error: 'Expected multipart/form-data with a "file" field.' },
            { status: 400 }
        );
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Audio too large. Max is 25MB." }, { status: 413 });
    }

    const locale = String(incoming.get("language") ?? incoming.get("locale") ?? "");
    const loc = normalizeSpeechLocale(locale);

    const target = String(incoming.get("target") ?? "").slice(0, 500);
    const extraPrompt = String(incoming.get("prompt") ?? "").slice(0, 1500);

    const haitianPrompt = [
        "CodeLanguage: Haitian Creole / Kreyòl ayisyen. Pa tradui.",
        target ? `Fraz sib: ${target}` : null,
        extraPrompt || null,
        "Transkri egzakteman sa w tande a. Kenbe òtograf nòmal.",
    ]
        .filter(Boolean)
        .join("\n");

    const nonHaitianPrompt = [
        extraPrompt || null,
        target ? `Target: ${target}` : null,
        "Transcribe exactly what you hear. Do not translate.",
    ]
        .filter(Boolean)
        .join("\n");

    const prompt = loc.isHaitian ? haitianPrompt : nonHaitianPrompt;

    const modelsToTry = [MODEL_PRIMARY, MODEL_FALLBACK, MODEL_SNAPSHOT, "whisper-1"];
    const languageCandidates = loc.languageCandidates;

    let lastErr: any = null;

    for (const model of modelsToTry) {
        const wantLogprobs = modelSupportsLogprobs(model);
        const tryChunkFirst = modelTryChunkingFirst(model);

        for (const lang of languageCandidates) {
            // Strategy per model/lang:
            // 1) try with chunking (if eligible) + logprobs (if eligible)
            // 2) if chunking rejected -> retry same model/lang w/out chunking
            // 3) if logprobs rejected -> retry same model/lang w/out logprobs
            // 4) if language rejected (ht) -> retry w/out language (your loc.languageCandidates already covers that)
            const attempts: Array<{ useChunking: boolean; useLogprobs: boolean }> = [];

            if (tryChunkFirst) attempts.push({ useChunking: true, useLogprobs: wantLogprobs });
            attempts.push({ useChunking: false, useLogprobs: wantLogprobs });

            if (wantLogprobs) {
                attempts.push({ useChunking: false, useLogprobs: false });
                if (tryChunkFirst) attempts.push({ useChunking: true, useLogprobs: false });
            }

            // de-dupe
            const uniq = new Map<string, { useChunking: boolean; useLogprobs: boolean }>();
            for (const a of attempts) uniq.set(`${a.useChunking ? 1 : 0}:${a.useLogprobs ? 1 : 0}`, a);

            for (const a of uniq.values()) {
                const resp = await attemptOnce({
                    apiKey,
                    model,
                    file,
                    prompt,
                    language: lang || "",
                    useChunking: a.useChunking,
                    useLogprobs: a.useLogprobs,
                });

                if (resp.ok) {
                    const j = resp.json ?? safeJson(resp.text) ?? {};
                    const text = normalizePhrase(String((j as any)?.text ?? ""));
                    const conf = confidenceFromLogprobs((j as any)?.logprobs);

                    return NextResponse.json({
                        text,
                        model,
                        usedLanguage: lang || null,
                        isHaitian: loc.isHaitian,
                        usedChunking: a.useChunking,
                        usedLogprobs: a.useLogprobs,
                        confidence: conf,
                    });
                }

                const detail = resp.json ?? resp.text;

                // Save last error for reporting
                lastErr = {
                    model,
                    usedLanguage: lang || null,
                    usedChunking: a.useChunking,
                    usedLogprobs: a.useLogprobs,
                    status: resp.status,
                    message: pickOpenAiMessage(detail),
                    detail,
                };

                // If the failure is specifically about params, keep trying within this model/lang
                const chunkBad = a.useChunking && looksLikeUnsupportedParam(detail, "chunking_strategy");
                const logprobBad = a.useLogprobs && (looksLikeUnsupportedParam(detail, "logprobs") || looksLikeUnsupportedParam(detail, "include"));
                const langBad = lang && looksLikeUnsupportedLanguage(detail);

                if (chunkBad || logprobBad) continue;

                // If HT + language=ht fails, retry without language (handled by languageCandidates loop)
                if (loc.isHaitian && lang === "ht" && langBad) break;

                // If not a param/model/language support issue, bail early for this model/lang
                if (!shouldTryNextModel(detail) && !langBad) break;
            }
        }
    }

    return NextResponse.json(
        { error: "OpenAI transcription failed", ...lastErr },
        { status: lastErr?.status ?? 400 }
    );
}