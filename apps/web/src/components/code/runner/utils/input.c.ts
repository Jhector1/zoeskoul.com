export function extractCPrintfPrompts(code: string): string[] {
    const src = String(code ?? "");
    const prompts: string[] = [];

    const tokenRe =
        /\bprintf\s*\(\s*"((?:\\.|[^"\\])*)"[\s\S]*?\)|\bscanf\s*\(|\bgets\s*\(|\bfgets\s*\(/g;

    let pendingPrompt: string | null = null;

    for (const m of src.matchAll(tokenRe)) {
        const full = m[0] ?? "";
        const printfLiteral = m[1];

        // saw printf("...")
        if (typeof printfLiteral === "string" && full.startsWith("printf")) {
            pendingPrompt = unescapeCString(printfLiteral);
            continue;
        }

        // saw scanf( / gets( / fgets(
        prompts.push((pendingPrompt ?? "Input:").trimEnd());
        pendingPrompt = null;
    }

    return prompts;
}

function unescapeCString(x: string) {
    const s = String(x ?? "");
    let out = "";

    for (let i = 0; i < s.length; ) {
        const ch = s[i];
        if (ch !== "\\") {
            out += ch;
            i++;
            continue;
        }

        const nxt = s[i + 1];
        if (nxt == null) {
            out += "\\";
            i++;
            continue;
        }

        switch (nxt) {
            case "\\":
                out += "\\";
                i += 2;
                break;
            case "n":
                out += "\n";
                i += 2;
                break;
            case "r":
                out += "\r";
                i += 2;
                break;
            case "t":
                out += "\t";
                i += 2;
                break;
            case '"':
                out += '"';
                i += 2;
                break;
            default:
                out += nxt;
                i += 2;
                break;
        }
    }

    return out;
}

export function countCInputs(code: string): number {
    const src = String(code ?? "");
    const scanfCount = (src.match(/\bscanf\s*\(/g) ?? []).length;
    const getsCount = (src.match(/\bgets\s*\(/g) ?? []).length;
    const fgetsCount = (src.match(/\bfgets\s*\(/g) ?? []).length;
    return scanfCount + getsCount + fgetsCount;
}