"use client";

export type SfxEvent = "answer:correct" | "answer:wrong";

const target = new EventTarget();

export function emitSfx(ev: SfxEvent) {
    target.dispatchEvent(new CustomEvent(ev));
}

export function onSfx(ev: SfxEvent, fn: () => void) {
    const handler = () => fn();
    target.addEventListener(ev, handler as any);
    return () => target.removeEventListener(ev, handler as any);
}