"use client";

import type { SfxEvent } from "./bus";

const URLS: Record<SfxEvent, string> = {
    "answer:correct": "/sfx/correct.mp3",
    "answer:wrong": "/sfx/wrong.mp3",
};

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loads = new Map<string, Promise<void>>();

function getCtx() {
    if (ctx) return ctx;
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    ctx = new AC();
    return ctx;
}

async function load(url: string) {
    if (buffers.has(url)) return;
    if (!loads.has(url)) {
        loads.set(
            url,
            (async () => {
                const c = getCtx();
                const res = await fetch(url);
                const ab = await res.arrayBuffer();
                const buf = await c.decodeAudioData(ab.slice(0));
                buffers.set(url, buf);
            })().catch(() => {})
        );
    }
    await loads.get(url);
}

export async function unlockAndPreload() {
    const c = getCtx();
    if (c.state === "suspended") {
        try { await c.resume(); } catch {}
    }
    await Promise.all(Object.values(URLS).map(load));
}

export function play(ev: SfxEvent, volume = 0.7) {
    const url = URLS[ev];

    // If not unlocked yet, fallback (usually fine after first gesture anyway)
    if (!ctx || !buffers.has(url)) {
        try {
            const a = new Audio(url);
            a.volume = Math.max(0, Math.min(1, volume));
            void a.play();
        } catch {}
        return;
    }

    const c = ctx!;
    const buf = buffers.get(url)!;

    const src = c.createBufferSource();
    src.buffer = buf;

    const gain = c.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));

    src.connect(gain);
    gain.connect(c.destination);
    src.start(0);
}