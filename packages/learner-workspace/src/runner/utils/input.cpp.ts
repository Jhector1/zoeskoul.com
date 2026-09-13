export function extractCppCoutPrompts(code: string): string[] {
    const src = String(code ?? "");
    const prompts: string[] = [];

    const tokenRe =
        /\b(?:std::)?cout\s*<<\s*"((?:\\.|[^"\\])*)"|\b(?:std::)?cin\s*>>|\bgetline\s*\(/g;

    let pendingPrompt: string | null = null;

    for (const m of src.matchAll(tokenRe)) {
        const coutLiteral = m[1];

        // saw cout << "..."
        if (typeof coutLiteral === "string") {
            pendingPrompt = unescapeCppCString(coutLiteral);
            continue;
        }

        // saw cin >> or getline(
        prompts.push((pendingPrompt ?? "").trimEnd());
        pendingPrompt = null;
    }

    return prompts;
}

function unescapeCppCString(x: string) {
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

export function countCppInputs(code: string): number {
    const src = String(code ?? "");
    const cin = (src.match(/\b(?:std::)?cin\s*>>/g) ?? []).length;
    const getline = (src.match(/\bgetline\s*\(/g) ?? []).length;
    return cin + getline;
}