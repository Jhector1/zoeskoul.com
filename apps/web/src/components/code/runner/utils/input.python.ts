export function extractInputPromptsPython(code: string): string[] {
    const src = String(code ?? "");
    const prompts: string[] = [];

    // Matches:
    // input()
    // input("Enter name: ")
    // input('Enter name: ')
    // builtins.input(...)
    const re =
        /\b(?:builtins\.)?input\s*\(\s*(?:(["'])((?:\\.|(?!\1).)*)\1)?\s*\)/g;

    for (const m of src.matchAll(re)) {
        const quote = m[1];
        const raw = m[2];

        if (!quote || typeof raw !== "string") {
            prompts.push("Input:");
            continue;
        }

        prompts.push(unescapePythonString(raw).trimEnd());
    }

    return prompts;
}

function unescapePythonString(x: string) {
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
            case "'":
                out += "'";
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

export function countPythonInputs(code: string): number {
    const src = String(code ?? "");
    const m = src.match(/\b(?:builtins\.)?input\s*\(/g);
    return m ? m.length : 0;
}