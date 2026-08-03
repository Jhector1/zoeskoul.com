export function normalizeVisibleTerminalTranscriptText(chunks: Iterable<unknown>) {
    const parts = Array.from(chunks)
        .map((chunk) => String(chunk ?? "").replace(/\r/g, "").trim())
        .filter(Boolean);

    if (!parts.length) return "";

    return parts
        .join("\n")
        .replace(
            /(?<![\n\r])(?=\[[^\]\n\r]+\][^$\n\r#]*[$#]\s)/g,
            "\n",
        )
        .trim();
}
