import readline from "node:readline";

type RenderProgressArgs = {
    current: number;
    total: number;
    label?: string;
    width?: number;
};

const state = {
    lastRenderAt: 0,
    lastCurrent: -1,
    lastTotal: -1,
    lastLabel: "",
    hasActiveLine: false,
};

const ANSI = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    dim: "\x1b[2m",
    reset: "\x1b[0m",
};

function supportsColor() {
    return Boolean(process.stderr.isTTY) &&
        process.env.NO_COLOR !== "1" &&
        process.env.TERM !== "dumb";
}

function color(text: string, code: string) {
    return supportsColor() ? `${code}${text}${ANSI.reset}` : text;
}

function green(text: string) {
    return color(text, ANSI.green);
}

function red(text: string) {
    return color(text, ANSI.red);
}

function dim(text: string) {
    return color(text, ANSI.dim);
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function clean(value: unknown): string {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncateLabel(label: string, maxLength: number): string {
    const text = clean(label);

    if (maxLength <= 0) return "";
    if (text.length <= maxLength) return text;
    if (maxLength <= 2) return text.slice(0, maxLength);

    return `${text.slice(0, maxLength - 2)}..`;
}

function buildBar(args: {
    current: number;
    total: number;
    width: number;
}) {
    const total = Math.max(1, args.total);
    const current = clamp(args.current, 0, total);
    const width = Math.max(8, args.width);

    const ratio = current / total;
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const percent = Math.round(ratio * 100);

    const filledText = "█".repeat(filled);
    const emptyText = "░".repeat(empty);

    const plain = `[${filledText}${emptyText}] ${current}/${total} ${percent}%`;
    const colored = `[${green(filledText)}${dim(emptyText)}] ${green(
        `${current}/${total} ${percent}%`,
    )}`;

    return {
        plain,
        colored,
        current,
        total,
    };
}

function formatProgressLine(args: RenderProgressArgs) {
    const width = args.width ?? 28;
    const bar = buildBar({
        current: Number(args.current ?? 0),
        total: Number(args.total ?? 0),
        width,
    });

    const streamColumns = process.stderr.columns ?? process.stdout.columns ?? 100;
    const maxColumns = Math.max(40, streamColumns - 1);

    const labelMax = Math.max(0, maxColumns - bar.plain.length - 1);
    const label = args.label ? truncateLabel(args.label, labelMax) : "";

    return label ? `${bar.colored} ${label}` : bar.colored;
}

function shouldThrottle(args: RenderProgressArgs) {
    const now = Date.now();
    const label = clean(args.label);
    const current = Number(args.current ?? 0);
    const total = Number(args.total ?? 0);

    const same =
        state.lastCurrent === current &&
        state.lastTotal === total &&
        state.lastLabel === label;

    if (same) return true;

    const tooSoon = now - state.lastRenderAt < 35;

    state.lastRenderAt = now;
    state.lastCurrent = current;
    state.lastTotal = total;
    state.lastLabel = label;

    return tooSoon && current !== total;
}

export function renderProgressBar(args: RenderProgressArgs) {
    if (shouldThrottle(args)) return;

    if (!process.stderr.isTTY) {
        return;
    }

    const line = formatProgressLine(args);

    readline.clearLine(process.stderr, 0);
    readline.cursorTo(process.stderr, 0);
    process.stderr.write(line);
    state.hasActiveLine = true;
}

export function finishProgressBar(message?: string) {
    const finalMessage = clean(message);

    if (process.stderr.isTTY) {
        if (state.hasActiveLine) {
            readline.clearLine(process.stderr, 0);
            readline.cursorTo(process.stderr, 0);
        }

        if (finalMessage) {
            const styled =
                finalMessage.startsWith("✔")
                    ? green(finalMessage)
                    : finalMessage.startsWith("✖")
                        ? red(finalMessage)
                        : finalMessage;

            process.stderr.write(`${styled}\n`);
        } else if (state.hasActiveLine) {
            process.stderr.write("\n");
        }
    } else if (finalMessage) {
        process.stderr.write(`${finalMessage}\n`);
    }

    state.lastRenderAt = 0;
    state.lastCurrent = -1;
    state.lastTotal = -1;
    state.lastLabel = "";
    state.hasActiveLine = false;
}

