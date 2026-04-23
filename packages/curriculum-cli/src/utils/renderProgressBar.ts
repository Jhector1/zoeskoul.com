import readline from "node:readline";

const ANSI = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    dim: "\x1b[2m",
};

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function truncateLabel(label: string, maxLength: number): string {
    if (maxLength <= 0) return "";
    if (label.length <= maxLength) return label;
    if (maxLength <= 3) return ".".repeat(maxLength);
    return `${label.slice(0, maxLength - 3)}...`;
}

export function renderProgressBar(args: {
    current: number;
    total: number;
    label?: string;
    width?: number;
}) {
    const total = Math.max(1, args.total);
    const current = clamp(args.current, 0, total);
    const width = args.width ?? 28;

    const ratio = current / total;
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const percent = Math.round(ratio * 100);

    const filledBar = `${ANSI.green}${"█".repeat(filled)}${ANSI.reset}`;
    const emptyBar = `${ANSI.dim}${"░".repeat(empty)}${ANSI.reset}`;

    const baseText = `[${filledBar}${emptyBar}] ${current}/${total} ${percent}%`;
    const terminalWidth = process.stdout.columns ?? 100;
    const reserved = baseText.replace(/\x1b\[[0-9;]*m/g, "").length + 1;
    const maxLabelLength = Math.max(0, terminalWidth - reserved - 1);
    const label = args.label ? ` ${truncateLabel(args.label, maxLabelLength)}` : "";

    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(`${baseText}${label}`);
}

export function finishProgressBar(message?: string) {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);

    if (message) {
        process.stdout.write(message);
    }

    process.stdout.write("\n");
}