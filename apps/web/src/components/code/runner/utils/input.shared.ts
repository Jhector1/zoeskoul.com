import { cleanTermText } from "./text";

export function stripPromptsFromStdout(stdout: string, prompts: string[]) {
    let s = cleanTermText(stdout ?? "");

    // remove each prompt ONCE, in order
    for (const p of prompts) {
        if (!p) continue;

        const idx = s.indexOf(p);
        if (idx >= 0) {
            const after = s.slice(idx + p.length);
            const cut = after.startsWith(" ") ? p + " " : p;
            s = s.slice(0, idx) + s.slice(idx + cut.length);
        }
    }

    return s;
}
