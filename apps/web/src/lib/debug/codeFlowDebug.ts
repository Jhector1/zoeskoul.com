// src/lib/debug/codeFlowDebug.ts
let seq = 0;

export function flowLog(scope: string, payload?: Record<string, unknown>) {
    seq += 1;
    const n = String(seq).padStart(4, "0");
    console.log(`[flow ${n}] ${scope}`, payload ?? {});
}

export function shortCode(v: unknown, max = 80) {
    const s = String(v ?? "");
    return s.length > max ? `${s.slice(0, max)}…` : s;
}