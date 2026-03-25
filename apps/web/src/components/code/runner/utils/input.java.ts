export function extractJavaPrintPrompts(code: string): string[] {
    const src = String(code ?? "");
    const prompts: string[] = [];

    const tokenRe =
        /System\.out\.print(?:ln)?\(\s*"((?:\\.|[^"\\])*)"\s*\)\s*;|(?:\w+)\s*\.\s*next(?:\s*\(|Line\s*\(|Int\s*\(|Long\s*\(|Double\s*\(|Float\s*\(|Boolean\s*\(|Short\s*\(|Byte\s*\()/g;

    let pendingPrompt: string | null = null;

    for (const m of src.matchAll(tokenRe)) {
        const literal = m[1];

        if (typeof literal === "string") {
            pendingPrompt = unescapeJavaString(literal);
            continue;
        }

        prompts.push((pendingPrompt ?? "Input:").trimEnd());
        pendingPrompt = null;
    }

    return prompts;
}

function unescapeJavaString(x: string) {
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

export function countJavaInputs(code: string): number {
    const src = String(code ?? "");
    const m = src.match(
        /\.\s*next(?:\s*\(|Line\s*\(|Int\s*\(|Long\s*\(|Double\s*\(|Float\s*\(|Boolean\s*\(|Short\s*\(|Byte\s*\()/g,
    );
    return m ? m.length : 0;
}