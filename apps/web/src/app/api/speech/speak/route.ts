// src/app/api/speech/speak/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const MAX_CHARS = 4096; // OpenAI TTS input max 4096 chars :contentReference[oaicite:5]{index=5}

type Format = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

function contentTypeFor(format: Format) {
    switch (format) {
        case "mp3":
            return "audio/mpeg";
        case "opus":
            return "audio/ogg";
        case "aac":
            return "audio/aac";
        case "flac":
            return "audio/flac";
        case "wav":
            return "audio/wav";
        case "pcm":
            return "application/octet-stream";
        default:
            return "audio/mpeg";
    }
}

async function safeJson(r: Response) {
    try {
        return await r.json();
    } catch {
        return null;
    }
}

// Optional: pin a snapshot for consistent voice output over time
const DEFAULT_TTS_MODEL =
    process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts"; // or "gpt-4o-mini-tts-2025-12-15" :contentReference[oaicite:6]{index=6}

export async function POST(req: Request) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    let body: any = null;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
    }

    const text = String(body?.text ?? body?.input ?? "").trim();
    if (!text) return NextResponse.json({ error: 'Missing "text"' }, { status: 400 });
    if (text.length > MAX_CHARS) {
        return NextResponse.json(
            { error: `Text too long (${text.length}). Max is ${MAX_CHARS} chars.` },
            { status: 413 }
        );
    }

    // Marin/Cedar are high-quality voices :contentReference[oaicite:7]{index=7}
    const voice = String(body?.voice ?? "marin");
    const format = (String(body?.format ?? "mp3") as Format) || "mp3";
    const speed = typeof body?.speed === "number" ? body.speed : 1.0;

    const instructions =
        String(body?.instructions ?? "").trim() ||
        [
            "Speak in Haitian Creole (Kreyòl ayisyen). Do not switch to English.",
            "Warm, clear teacher tone. Slightly slow. Clean consonants.",
            "Use Haitian pronunciation (nasal vowels: an/on/en).",
            "Do not read punctuation aloud.",
        ].join(" ");

    const payload = {
        model: DEFAULT_TTS_MODEL,
        voice,
        input: text,
        instructions,
        response_format: format,
        speed,
    };

    const r = await fetch(OPENAI_SPEECH_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!r.ok) {
        const detail = await safeJson(r);
        return NextResponse.json(
            {
                error: "OpenAI TTS failed",
                status: r.status,
                message: detail?.error?.message ?? detail?.message ?? "Unknown error",
                detail,
            },
            { status: r.status }
        );
    }

    const arrayBuffer = await r.arrayBuffer();
    return new Response(Buffer.from(arrayBuffer), {
        status: 200,
        headers: {
            "Content-Type": contentTypeFor(format),
            "Cache-Control": "no-store",
        },
    });
}