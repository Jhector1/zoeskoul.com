const DEFAULT_TERMINAL_IDENTITY_MAX_LENGTH = 420;

/**
 * Small synchronous 128-bit digest for browser-owned identity keys.
 *
 * These values are routing/cache identities, not security tokens. The four
 * mixed 32-bit lanes keep the collision surface tiny while remaining usable
 * during render, where async Web Crypto is not available.
 */
export function terminalIdentityDigest(input: string): string {
    let h1 = 0x9e3779b9;
    let h2 = 0x243f6a88;
    let h3 = 0xb7e15162;
    let h4 = 0xdeadbeef;

    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 0x85ebca6b);
        h2 = Math.imul(h2 ^ code, 0xc2b2ae35);
        h3 = Math.imul(h3 ^ code, 0x27d4eb2f);
        h4 = Math.imul(h4 ^ code, 0x165667b1);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b) ^ h2;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35) ^ h3;
    h3 = Math.imul(h3 ^ (h3 >>> 16), 0x27d4eb2f) ^ h4;
    h4 = Math.imul(h4 ^ (h4 >>> 13), 0x165667b1) ^ h1;

    return [h1, h2, h3, h4]
        .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
        .join("");
}

/**
 * Keep terminal identities readable while guaranteeing that meaningful suffixes
 * are never discarded by the server's 500-character safety boundary.
 *
 * Review workspaces can carry a serialized starter workspace in their identity.
 * Prefix truncation made Terminal 1 and Terminal 2 identical because their
 * distinct `:owner:<tab-id>` suffix appeared after character 500. A digest keeps
 * the full value significant instead of trusting an arbitrary prefix.
 */
export function compactTerminalIdentityKey(
    input: string,
    maxLength = DEFAULT_TERMINAL_IDENTITY_MAX_LENGTH,
): string {
    const value = String(input ?? "").trim();
    const safeMax = Math.max(80, Math.floor(maxLength));

    if (value.length <= safeMax) return value;

    const digest = terminalIdentityDigest(value);
    const separator = "::identity:";
    const readablePrefixLength = Math.max(
        24,
        Math.min(160, safeMax - separator.length - digest.length),
    );
    const readablePrefix = value.slice(0, readablePrefixLength);

    return `${readablePrefix}${separator}${digest}`;
}
