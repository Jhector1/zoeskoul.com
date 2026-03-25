"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import Tooltip from "@/components/ui/Tooltip";

import {
    Mic,
    Square,
    Trash2,
    Volume2,
    Loader2,
    ShieldCheck,
    Zap,
    AudioWaveformIcon,
} from "lucide-react";


/* --------------------------------- speech api -------------------------------- */

function getSpeechRecognition(): any | null {
    if (typeof window === "undefined") return null;
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function getSpeechGrammarListCtor(): any | null {
    if (typeof window === "undefined") return null;
    const w = window as any;
    return w.SpeechGrammarList || w.webkitSpeechGrammarList || null;
}

function normalizeSpeechLang(locale?: string) {
    const raw = String(locale ?? "").trim();
    if (!raw) return "ht";
    const lower = raw.toLowerCase();

    if (lower === "ht" || lower.startsWith("ht-") || lower === "hat") return "ht";
    if (lower === "fr" || lower.startsWith("fr-")) return "fr-FR";
    if (lower === "en" || lower.startsWith("en-")) return "en-US";

    return raw;
}

function normalizePhrase(s: string) {
    return String(s ?? "")
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeJsgfPhrase(s: string) {
    return normalizePhrase(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildJsgfFromPhrases(phrases: string[]) {
    const uniq = Array.from(new Set(phrases.map(normalizePhrase).filter(Boolean))).slice(0, 40);
    if (!uniq.length) return null;
    const body = uniq.map((p) => `"${escapeJsgfPhrase(p)}"`).join(" | ");
    return `#JSGF V1.0; grammar phrases; public <phrase> = ${body} ;`;
}

function phraseVariants(target: string) {
    const t = normalizePhrase(target);
    if (!t) return [];
    const stripped = t.replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
    return Array.from(new Set([t, stripped].filter(Boolean)));
}

function pickBestAlternative(res: any): { text: string; conf: number } {
    let bestText = "";
    let bestConf = -1;
    const len = typeof res?.length === "number" ? res.length : 0;
    for (let j = 0; j < len; j++) {
        const alt = res[j];
        const text = String(alt?.transcript ?? "").trim();
        const conf = typeof alt?.confidence === "number" ? alt.confidence : 0;
        if (text && conf >= bestConf) {
            bestText = text;
            bestConf = conf;
        }
    }
    return { text: bestText, conf: bestConf };
}

/* --------------------------------- utils --------------------------------- */

function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
}

// Basic autocorrelation pitch estimation (good enough for voiced speech)
function estimatePitchHz(buf: Float32Array, sampleRate: number): number | null {
    let mean = 0;
    for (let i = 0; i < buf.length; i++) mean += buf[i];
    mean /= buf.length;

    const x = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) x[i] = buf[i] - mean;

    let rms = 0;
    for (let i = 0; i < x.length; i++) rms += x[i] * x[i];
    rms = Math.sqrt(rms / x.length);
    if (rms < 0.015) return null;

    const minHz = 60;
    const maxHz = 400;
    const minLag = Math.floor(sampleRate / maxHz);
    const maxLag = Math.floor(sampleRate / minHz);

    let bestLag = -1;
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        for (let i = 0; i < x.length - lag; i++) corr += x[i] * x[i + lag];
        if (corr > bestCorr) {
            bestCorr = corr;
            bestLag = lag;
        }
    }

    if (bestLag <= 0) return null;
    const hz = sampleRate / bestLag;
    if (!Number.isFinite(hz) || hz < minHz || hz > maxHz) return null;
    return hz;
}

/* --------------------------- server STT helpers --------------------------- */

function canUseMediaRecorder(): boolean {
    if (typeof window === "undefined") return false;
    return typeof (window as any).MediaRecorder !== "undefined" && Boolean(navigator?.mediaDevices?.getUserMedia);
}

function pickMimeType() {
    if (typeof window === "undefined") return "";
    const MR = (window as any).MediaRecorder;
    const isSupported = (t: string) => !!MR?.isTypeSupported?.(t);

    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
    for (const t of candidates) if (isSupported(t)) return t;
    return "";
}

async function blobToFile(blob: Blob, filename: string) {
    return new File([blob], filename, { type: blob.type || "audio/webm" });
}

/* -------------------------------- ui helpers -------------------------------- */

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

function IconBtn({
                     label,
                     tip,
                     Icon,
                     className,
                     iconClassName,
                     showLabel = true,
                     tooltipSide = "top",
                     tooltipBelowLgOnly = false,
                     ...props
                 }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    tip?: string;
    Icon: IconType;
    iconClassName?: string;
    showLabel?: boolean;
    tooltipSide?: "top" | "bottom";
    tooltipBelowLgOnly?: boolean;
}) {
    const btn = (
        <button
            {...props}
            aria-label={label}
            className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}
        >
            <Icon className={["h-4 w-4", iconClassName].filter(Boolean).join(" ")} aria-hidden="true" />
            {showLabel ? <span className="hidden sm:inline">{label}</span> : <span className="sr-only">{label}</span>}
        </button>
    );

    return (
        <Tooltip tip={tip ?? label} side={tooltipSide} belowLgOnly={tooltipBelowLgOnly}>
            {btn}
        </Tooltip>
    );
}

/* -------------------------------- component -------------------------------- */

export default function VoiceInputExerciseUI({
                                                 exercise,
                                                 transcript,
                                                 onChangeTranscript,
                                                 disabled,
                                                 checked,
                                                 ok,
                                                 reviewCorrectTranscript = null,
                                             }: {
    exercise: {
        title: string;
        prompt: string;
        targetText: string;
        locale?: string;
        maxSeconds?: number;
        hint?: string;
    };
    transcript: string;
    onChangeTranscript: (t: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
    reviewCorrectTranscript?: string | null;
}) {
    const Rec = useMemo(() => getSpeechRecognition(), []);
    const recRef = useRef<any | null>(null);

    const lang = useMemo(() => normalizeSpeechLang(exercise.locale), [exercise.locale]);
    const isHaitian = lang === "ht";

    // TTS read-back
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [autoReadBack, setAutoReadBack] = useState(false);
    const [ttsStatus, setTtsStatus] = useState<string | null>(null);

    const speakBack = useCallback(async (text: string) => {
        const clean = String(text ?? "").trim();
        if (!clean) return;

        try {
            setTtsStatus("Playing…");

            const res = await fetch("/api/speech/speak", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: clean,
                    voice: "marin",
                    format: "mp3",
                    speed: 1.0,
                    instructions: "Speak in Haitian Creole. Clear, friendly, teacher-like. Slightly slow.",
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

            try {
                a.pause();
                a.currentTime = 0;
            } catch {}

            const prev = (a as any).__blobUrl as string | undefined;
            if (prev) URL.revokeObjectURL(prev);
            (a as any).__blobUrl = url;

            a.src = url;
            await a.play();
            setTtsStatus(null);
        } catch (e: any) {
            setTtsStatus(`Play failed: ${String(e?.message ?? e)}`);
        }
    }, []);

    const [mode, setMode] = useState<"server" | "browser">("server");
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    // Force Haitian to server-only (best long-term accuracy)
    useEffect(() => {
        if (isHaitian) setMode("server");
    }, [isHaitian]);

    // Visualizer
    const [showViz, setShowViz] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);

    const mediaStreamRef = useRef<MediaStream | null>(null);

    const ampTextRef = useRef<HTMLSpanElement | null>(null);
    const pitchTextRef = useRef<HTMLSpanElement | null>(null);
    const ampSmoothRef = useRef(0);

    // Server STT recording
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const stopTimeoutRef = useRef<number | null>(null);

    const canBrowser = Boolean(Rec);
    const canServer = canUseMediaRecorder();
    const canAny = !disabled && (canServer || canBrowser);

    const clearStopTimeout = useCallback(() => {
        if (stopTimeoutRef.current) {
            window.clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
        }
    }, []);

    // ✅ always acquire mic for server mode (independent of showViz)
    const ensureMicStream = useCallback(async () => {
        if (mediaStreamRef.current) return mediaStreamRef.current;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } as any,
            video: false,
        });

        mediaStreamRef.current = stream;
        return stream;
    }, []);

    // ✅ stop only viz rendering + audio nodes (don’t stop mic tracks)
    const stopVizOnly = useCallback(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        try {
            analyserRef.current?.disconnect();
        } catch {}
        analyserRef.current = null;

        try {
            audioCtxRef.current?.close?.();
        } catch {}
        audioCtxRef.current = null;

        ampSmoothRef.current = 0;
        if (ampTextRef.current) ampTextRef.current.textContent = "0%";
        if (pitchTextRef.current) pitchTextRef.current.textContent = "—";

        const c = canvasRef.current;
        if (c) {
            const g = c.getContext("2d");
            if (g) g.clearRect(0, 0, c.width, c.height);
        }
    }, []);

    // ✅ stop mic tracks (only when session truly ends)
    const stopMicStream = useCallback(() => {
        try {
            mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
        } catch {}
        mediaStreamRef.current = null;
    }, []);

    const startVisualizer = useCallback(
        async (stream: MediaStream) => {
            if (!showViz) return;
            if (analyserRef.current || audioCtxRef.current) return;

            const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
            if (!AudioCtx) return;

            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;

            try {
                if (ctx.state === "suspended") await ctx.resume();
            } catch {}

            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyserRef.current = analyser;

            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.86;
            source.connect(analyser);

            const timeU8 = new Uint8Array(analyser.fftSize);
            const timeF32 = new Float32Array(analyser.fftSize);

            let lastTextUpdate = 0;

            const draw = (t: number) => {
                const a = analyserRef.current;
                const audioCtx = audioCtxRef.current;
                const canvas = canvasRef.current;
                if (!a || !audioCtx || !canvas) return;

                const dpr = window.devicePixelRatio || 1;
                const cssW = canvas.clientWidth || 1;
                const cssH = canvas.clientHeight || 1;
                const w = Math.max(1, Math.floor(cssW * dpr));
                const h = Math.max(1, Math.floor(cssH * dpr));
                if (canvas.width !== w || canvas.height !== h) {
                    canvas.width = w;
                    canvas.height = h;
                }

                const g = canvas.getContext("2d");
                if (!g) return;

                a.getByteTimeDomainData(timeU8);

                let sumSq = 0;
                for (let i = 0; i < timeU8.length; i++) {
                    const v = (timeU8[i] - 128) / 128;
                    sumSq += v * v;
                    timeF32[i] = v;
                }

                const rms = Math.sqrt(sumSq / timeU8.length);
                const ampRaw = clamp01(rms * 2.2);

                const alpha = 0.9;
                const prev = ampSmoothRef.current;
                const amp = prev === 0 ? ampRaw : prev * alpha + ampRaw * (1 - alpha);
                ampSmoothRef.current = amp;

                const pitch = estimatePitchHz(timeF32, audioCtx.sampleRate);

                g.clearRect(0, 0, w, h);
                g.globalAlpha = 0.8;
                g.beginPath();
                for (let i = 0; i < timeU8.length; i++) {
                    const x = (i / (timeU8.length - 1)) * w;
                    const y = (timeU8[i] / 255) * h;
                    if (i === 0) g.moveTo(x, y);
                    else g.lineTo(x, y);
                }
                g.strokeStyle = "rgba(16,185,129,0.65)";
                g.lineWidth = Math.max(1.25 * dpr, 2);
                g.stroke();
                g.globalAlpha = 1;

                if (t - lastTextUpdate > 120) {
                    lastTextUpdate = t;
                    const ampPct = Math.round(amp * 100);
                    if (ampTextRef.current) ampTextRef.current.textContent = `${ampPct}%`;
                    if (pitchTextRef.current) pitchTextRef.current.textContent = pitch ? `${Math.round(pitch)} Hz` : "—";
                }

                rafRef.current = requestAnimationFrame(draw);
            };

            rafRef.current = requestAnimationFrame(draw);
        },
        [showViz]
    );

    // if user toggles viz on mid-session, attach viz to existing stream
    useEffect(() => {
        if (!showViz) {
            stopVizOnly();
            return;
        }
        const stream = mediaStreamRef.current;
        if (stream) void startVisualizer(stream);
    }, [showViz, startVisualizer, stopVizOnly]);

    useEffect(() => {
        return () => {
            try {
                recRef.current?.stop?.();
            } catch {}
            clearStopTimeout();
            try {
                mediaRecorderRef.current?.stop?.();
            } catch {}

            try {
                const a = audioRef.current as any;
                const prev = a?.__blobUrl as string | undefined;
                if (prev) URL.revokeObjectURL(prev);
            } catch {}

            stopVizOnly();
            stopMicStream();
        };
    }, [clearStopTimeout, stopMicStream, stopVizOnly]);

    /* -------------------------- server STT mode -------------------------- */

    const transcribeOnServer = useCallback(
        async (blob: Blob) => {
            const fd = new FormData();
            const file = await blobToFile(blob, "speech.webm");
            fd.append("file", file);

            // ✅ always send language/locale; server should do “try ht then omit”
            fd.append("language", normalizeSpeechLang(exercise.locale));
            fd.append("target", exercise.targetText);

            // include a bit more context to reduce English drift
            const promptParts = [
                "CodeLanguage: Haitian Creole / Kreyòl ayisyen. Pa tradui. Kenbe òtograf nòmal.",
                exercise.hint ? `Sijesyon: ${String(exercise.hint).slice(0, 200)}` : null,
                "Transkri egzakteman sa w tande a. Pa tradui.",
            ].filter(Boolean);

            fd.append("prompt", promptParts.join("\n"));

            const res = await fetch("/api/speech/transcribe", { method: "POST", body: fd });
            const json = await res.json().catch(() => ({}));

            const msg =
                (json as any)?.message ??
                (json as any)?.detail?.error?.message ??
                (json as any)?.detail?.message ??
                (json as any)?.error ??
                "Transcription failed";

            if (!res.ok) throw new Error(msg);

            return normalizePhrase(String((json as any)?.text ?? ""));
        },
        [exercise.locale, exercise.targetText, exercise.hint]
    );

    const startServerMode = useCallback(async () => {
        if (!canAny || !canServer) throw new Error("High accuracy recording not supported here.");

        setStatus(null);
        setIsRecording(true);

        // ✅ always acquire mic stream for server mode
        const stream = await ensureMicStream();
        await startVisualizer(stream);

        const mimeType = pickMimeType();
        const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = rec;
        chunksRef.current = [];

        rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };

        rec.onerror = () => {
            setStatus("Recording error.");
            setIsRecording(false);
            stopVizOnly();
            stopMicStream();
        };

        rec.onstop = async () => {
            try {
                setIsUploading(true);
                setStatus("Transcribing…");

                const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
                const text = await transcribeOnServer(blob);

                if (text) onChangeTranscript(text);
                if (autoReadBack && text) void speakBack(text);

                setStatus(null);
            } catch (e: any) {
                setStatus(`Transcription error: ${String(e?.message ?? e)}`);
            } finally {
                setIsUploading(false);
                setIsRecording(false);
                stopVizOnly();
                stopMicStream();
            }
        };

        rec.start(250);
        setStatus("Recording…");

        const max = Number(exercise.maxSeconds ?? 0);
        if (max > 0) {
            clearStopTimeout();
            stopTimeoutRef.current = window.setTimeout(() => {
                try {
                    if (rec.state !== "inactive") rec.stop();
                } catch {}
            }, max * 1000);
        }
    }, [
        autoReadBack,
        canAny,
        canServer,
        clearStopTimeout,
        ensureMicStream,
        exercise.maxSeconds,
        onChangeTranscript,
        speakBack,
        startVisualizer,
        stopMicStream,
        stopVizOnly,
        transcribeOnServer,
    ]);

    const stopServerMode = useCallback(() => {
        clearStopTimeout();
        const rec = mediaRecorderRef.current;
        try {
            if (rec && rec.state !== "inactive") rec.stop();
        } catch {}
    }, [clearStopTimeout]);

    /* -------------------------- browser mode -------------------------- */

    const startBrowserMode = useCallback(async () => {
        if (!canAny || !canBrowser) throw new Error("Browser SpeechRecognition not available.");

        setStatus(null);

        try {
            // only acquire stream for viz (SpeechRecognition itself handles mic)
            if (showViz) {
                const stream = await ensureMicStream();
                await startVisualizer(stream);
            }

            const R = Rec;
            if (!R) throw new Error("SpeechRecognition missing");

            const r = new R();
            recRef.current = r;

            const lang2 = normalizeSpeechLang(exercise.locale ?? "ht");

            r.lang = lang2;
            r.interimResults = true;
            r.continuous = false;
            r.maxAlternatives = 5;

            const GrammarList = getSpeechGrammarListCtor();
            if (GrammarList) {
                try {
                    const g = new GrammarList();
                    const phrases = [
                        ...phraseVariants(exercise.targetText),
                        ...(exercise.hint ? phraseVariants(exercise.hint) : []),
                    ];
                    const jsgf = buildJsgfFromPhrases(phrases);
                    if (jsgf) {
                        g.addFromString(jsgf, 1);
                        r.grammars = g;
                    }
                } catch {}
            }

            r.onstart = () => {
                setIsRecording(true);
                setStatus(lang2 === "ht" ? "Koute…" : "Listening…");
            };

            r.onerror = (e: any) => {
                setStatus(`Mic error: ${String(e?.error ?? "unknown")}`);
                setIsRecording(false);
                stopVizOnly();
                stopMicStream();
            };

            r.onnomatch = () => setStatus("Couldn’t catch that. Try again.");

            r.onend = () => {
                setIsRecording(false);
                setStatus(null);
                stopVizOnly();
                stopMicStream();
            };

            r.onresult = (event: any) => {
                let bestFinal = { text: "", conf: -1 };
                let bestInterim = { text: "", conf: -1 };

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    const best = pickBestAlternative(res);
                    if (res.isFinal) {
                        if (best.text && best.conf >= bestFinal.conf) bestFinal = best;
                    } else {
                        if (best.text && best.conf >= bestInterim.conf) bestInterim = best;
                    }
                }

                const next = normalizePhrase(bestFinal.text || bestInterim.text);
                if (next) onChangeTranscript(next);
            };

            r.start();

            const max = Number(exercise.maxSeconds ?? 0);
            if (max > 0) {
                clearStopTimeout();
                stopTimeoutRef.current = window.setTimeout(() => {
                    try {
                        r.stop();
                    } catch {}
                }, max * 1000);
            }
        } catch (e: any) {
            setStatus(`Speech not available: ${String(e?.message ?? e)}`);
            setIsRecording(false);
            stopVizOnly();
            stopMicStream();
        }
    }, [
        Rec,
        canAny,
        canBrowser,
        clearStopTimeout,
        ensureMicStream,
        exercise.hint,
        exercise.locale,
        exercise.maxSeconds,
        exercise.targetText,
        onChangeTranscript,
        showViz,
        startVisualizer,
        stopMicStream,
        stopVizOnly,
    ]);

    const stopBrowserMode = useCallback(() => {
        clearStopTimeout();
        try {
            recRef.current?.stop?.();
        } catch {}
        setIsRecording(false);
        setStatus(null);
        stopVizOnly();
        stopMicStream();
    }, [clearStopTimeout, stopMicStream, stopVizOnly]);

    /* -------------------------- unified controls -------------------------- */

    const start = useCallback(async () => {
        if (!canAny || disabled || isUploading || isRecording) return;

        setStatus(null);

        // ✅ Haitian: server-only, no browser fallback (prevents English drift)
        if (isHaitian) {
            try {
                await startServerMode();
            } catch (e: any) {
                setStatus(`High accuracy unavailable: ${String(e?.message ?? e)}.`);
            }
            return;
        }

        if (mode === "server") {
            try {
                await startServerMode();
                return;
            } catch (e: any) {
                const msg = String(e?.message ?? e);
                if (canBrowser) {
                    setStatus(`High accuracy unavailable: ${msg}. Falling back…`);
                    try {
                        await startBrowserMode();
                    } catch (e2: any) {
                        setStatus(`Speech not available: ${String(e2?.message ?? e2)}`);
                    }
                } else {
                    setStatus(`High accuracy unavailable: ${msg}`);
                }
                return;
            }
        }

        try {
            await startBrowserMode();
        } catch (e: any) {
            setStatus(`Speech not available: ${String(e?.message ?? e)}`);
        }
    }, [
        canAny,
        canBrowser,
        disabled,
        isUploading,
        isRecording,
        isHaitian,
        mode,
        startBrowserMode,
        startServerMode,
    ]);

    const stop = useCallback(() => {
        if (mode === "server" || isHaitian) stopServerMode();
        else stopBrowserMode();
    }, [isHaitian, mode, stopBrowserMode, stopServerMode]);

    /* --------------------------------- ui --------------------------------- */

    const muted = "text-neutral-600 dark:text-white/60";
    const text = "text-neutral-900 dark:text-white/90";

    const pillBase = "rounded-full border px-2.5 py-1 text-[11px] font-extrabold tabular-nums";
    const pillOk = "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
    const pillBad = "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-200";

    const btnPrimary = "ui-btn ui-btn-primary";
    const btnSecondary = "ui-btn ui-btn-secondary";
    const btnGhost = "ui-btn ui-btn-ghost";

    const startLabel = !canAny ? "No mic" : isUploading ? "Transcribing…" : isRecording ? "Recording…" : "Start";

    const modeLabel = isHaitian ? "High accuracy" : mode === "server" ? "High accuracy" : "Fast";
    const modeTip = isHaitian
        ? "Haitian uses high accuracy only"
        : mode === "server"
            ? "High accuracy (server)"
            : "Fast (browser)";

    const vizLabel = showViz ? "Hide mic" : "Show mic";
    const vizTip = showViz ? "Hide mic visualizer" : "Show mic visualizer";

    const startTip = !canAny
        ? "Microphone not available"
        : isUploading
            ? "Transcribing…"
            : isRecording
                ? "Recording…"
                : "Start recording";

    const stopTip = "Stop recording";
    const clearTip = "Clear transcript";
    const playTip = ttsStatus ? "Playing…" : "Play transcript";

    return (
        <div className="ui-card p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <ExercisePrompt exercise={exercise} />
                {typeof ok === "boolean" ? (
                    <div className={[pillBase, ok ? pillOk : pillBad].join(" ")}>
                        {ok ? "Correct" : "Try again"}
                    </div>
                ) : null}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className={`text-xs font-extrabold ${muted}`}>Speak clearly. You can edit the transcript anytime.</div>

                <div className="flex flex-wrap items-center gap-2">
                    <IconBtn
                        type="button"
                        className={btnSecondary}
                        disabled={disabled || isRecording || isUploading || isHaitian}
                        onClick={() => setMode((m) => (m === "server" ? "browser" : "server"))}
                        label={modeLabel}
                        tip={modeTip}
                        Icon={isHaitian || mode === "server" ? ShieldCheck : Zap}
                        tooltipSide="bottom"
                    />

                    <IconBtn
                        type="button"
                        className={btnSecondary}
                        disabled={disabled || isRecording || isUploading}
                        onClick={() => setShowViz((v) => !v)}
                        aria-pressed={showViz}
                        label={vizLabel}
                        tip={vizTip}
                        Icon={AudioWaveformIcon}
                        iconClassName={showViz ? "" : "opacity-70"}
                        tooltipSide="bottom"
                    />

                    <label className={`ml-1 inline-flex items-center gap-2 text-[11px] font-extrabold ${muted}`}>
                        <input type="checkbox" checked={autoReadBack} onChange={(e) => setAutoReadBack(e.target.checked)} />
                        <Volume2 className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
                        Read-back
                    </label>
                </div>
            </div>

            {status ? <div className={`mt-2 text-xs font-extrabold ${muted}`}>{status}</div> : null}
            {ttsStatus ? <div className={`mt-2 text-xs font-extrabold ${muted}`}>{ttsStatus}</div> : null}

            {showViz ? (
                <div className="mt-3 ui-soft p-3">
                    <div className="flex items-center justify-between">
                        <div className={`text-xs font-extrabold ${muted}`}>Mic</div>
                        <div className={`text-[11px] font-extrabold ${muted}`}>
                            Amp <span ref={ampTextRef}>0%</span> · Pitch <span ref={pitchTextRef}>—</span>
                        </div>
                    </div>
                    <canvas ref={canvasRef} className="mt-2 h-[64px] w-full rounded-xl bg-black/5 dark:bg-white/[0.05]" />
                </div>
            ) : null}

            <div className="mt-3 ui-soft p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className={`text-xs font-extrabold ${muted}`}>Transcript</div>

                    <div className="flex flex-wrap gap-2">
                        <IconBtn
                            type="button"
                            className={btnPrimary}
                            disabled={!canAny || disabled || isRecording || isUploading}
                            onClick={start}
                            label={startLabel}
                            tip={startTip}
                            Icon={isUploading ? Loader2 : Mic}
                            iconClassName={isUploading ? "animate-spin" : ""}
                            tooltipSide="bottom"
                        />

                        <IconBtn
                            type="button"
                            className={btnSecondary}
                            disabled={!isRecording}
                            onClick={stop}
                            label="Stop"
                            tip={stopTip}
                            Icon={Square}
                            tooltipSide="bottom"
                        />

                        <IconBtn
                            type="button"
                            className={btnGhost}
                            disabled={disabled || isRecording || isUploading}
                            onClick={() => onChangeTranscript("")}
                            label="Clear"
                            tip={clearTip}
                            Icon={Trash2}
                            tooltipSide="bottom"
                        />

                        <IconBtn
                            type="button"
                            className={btnSecondary}
                            disabled={disabled || isRecording || isUploading || !transcript?.trim()}
                            onClick={() => speakBack(transcript)}
                            label="Play"
                            tip={playTip}
                            Icon={ttsStatus ? Loader2 : Volume2}
                            iconClassName={ttsStatus ? "animate-spin" : ""}
                            tooltipSide="bottom"
                        />
                    </div>
                </div>

                <textarea
                    value={transcript ?? ""}
                    disabled={disabled}
                    onChange={(e) => onChangeTranscript(e.target.value)}
                    placeholder={isHaitian ? "Pale an kreyòl… oswa tape…" : "Speak or type…"}
                    className={[
                        "mt-2 w-full rounded-2xl border px-3 py-3 text-sm outline-none transition",
                        "min-h-[110px] sm:min-h-[130px]",
                        "border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-300",
                        "dark:border-white/10 dark:bg-white/[0.04] dark:text-white/90 dark:placeholder:text-white/40 dark:focus:border-white/20",
                        disabled ? "opacity-70" : "",
                    ].join(" ")}
                />

                <div className={`mt-2 flex items-center justify-between text-[11px] font-extrabold ${muted}`}>
                    <span>{exercise.maxSeconds ? `Auto-stop ${exercise.maxSeconds}s` : "Auto-stop off"}</span>
                    <span className="tabular-nums">{transcript?.length ?? 0}</span>
                </div>
            </div>

            <div className="mt-3 ui-soft p-3">
                <div className={`text-xs font-extrabold ${muted}`}>Target</div>
                <div className={`mt-1 text-sm font-extrabold ${text}`}>{exercise.targetText}</div>
                {exercise.hint ? (
                    <div className={`mt-1 text-xs font-extrabold ${muted}`}>
                        Hint: <span className="text-neutral-700 dark:text-white/70">{exercise.hint}</span>
                    </div>
                ) : null}
            </div>

            {checked && ok === false && reviewCorrectTranscript ? (
                <div className="mt-3 ui-soft p-3">
                    <div className={`text-xs font-extrabold ${muted}`}>Correct</div>
                    <div className={`mt-1 text-sm font-extrabold ${text}`}>{reviewCorrectTranscript}</div>
                </div>
            ) : null}
        </div>
    );
}