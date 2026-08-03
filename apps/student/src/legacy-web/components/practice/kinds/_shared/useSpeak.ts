"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeakOpts = {
    voice?: string;         // e.g. "marin"
    format?: "mp3" | "wav" | "opus";
    speed?: number;         // 0.8..1.2
    instructions?: string;  // style steering
};

export function useSpeak() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const urlRef = useRef<string | null>(null);
    const [ttsStatus, setTtsStatus] = useState<string | null>(null);

    const stop = useCallback(() => {
        const a = audioRef.current;
        if (a) {
            try {
                a.pause();
                a.currentTime = 0;
            } catch {}
        }
        setTtsStatus(null);
    }, []);

    const speak = useCallback(async (text: string, opts: SpeakOpts = {}) => {
        const clean = String(text ?? "").trim();
        if (!clean) return;

        try {
            setTtsStatus("Speaking…");

            const res = await fetch("/api/speech/speak", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: clean,
                    voice: opts.voice ?? "marin",
                    format: opts.format ?? "mp3",
                    speed: typeof opts.speed === "number" ? opts.speed : 1.0,
                    instructions:
                        opts.instructions ??
                        "Speak clearly and naturally. Friendly teacher tone. Slightly slow.",
                }),
            });

            if (!res.ok) {
                const j = await res.json().catch(() => null);
                throw new Error(j?.message ?? j?.error ?? "TTS failed");
            }

            const ct = res.headers.get("Content-Type") || "audio/mpeg";
            const ab = await res.arrayBuffer();
            const blob = new Blob([ab], { type: ct });
            const url = URL.createObjectURL(blob);

            const a = audioRef.current ?? new Audio();
            audioRef.current = a;

            // cleanup old
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            urlRef.current = url;

            try {
                a.pause();
                a.currentTime = 0;
            } catch {}

            a.src = url;

            // Autoplay may be blocked if not triggered by user gesture.
            await a.play();

            setTtsStatus(null);
        } catch (e: any) {
            setTtsStatus(`TTS: ${String(e?.message ?? e)}`);
        }
    }, []);

    useEffect(() => {
        return () => {
            try {
                if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            } catch {}
        };
    }, []);

    return { speak, stop, ttsStatus };
}