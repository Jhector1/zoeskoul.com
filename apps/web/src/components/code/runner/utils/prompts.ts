// src/components/code/runner/utils/prompts.ts
export function prettyPrompt(p: string) {
    return String(p ?? "")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .trim();
}

export function expandPrompts(prompts: string[], count: number, fallback = "") {
    if (count <= 0) return [];

    const base = (prompts ?? []).map((p) => String(p ?? ""));

    if (base.length >= count) return base.slice(0, count);

    return [...base, ...Array(count - base.length).fill(fallback)];
}

// Key fix: when two variants match at the same index, pick the LONGEST variant.
// That prevents leftover single-space segments.
export function splitStdoutByPrompts(stdout: string, prompts: string[]) {
    const out = String(stdout ?? "");
    if (!prompts.length) return [out];

    let pos = 0;
    const segs: string[] = [];

    for (const pRaw of prompts) {
        const p = String(pRaw ?? "");
        if (!p) continue;

        const variants = [p, p + " ", p.trimEnd(), p.trimEnd() + " "].filter(Boolean);

        let bestIdx = -1;
        let bestLen = 0;

        for (const v of variants) {
            const idx = out.indexOf(v, pos);
            if (idx === -1) continue;

            if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && v.length > bestLen)) {
                bestIdx = idx;
                bestLen = v.length;
            }
        }

        if (bestIdx === -1) break;

        segs.push(out.slice(pos, bestIdx));
        pos = bestIdx + bestLen;
    }

    segs.push(out.slice(pos));
    return segs;
}