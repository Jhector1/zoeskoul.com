/** Image/binary previews favor the visual content, while keeping a usable terminal. */
export function preferredBottomTerminalSize(initialSize: number, isBinaryPreview: boolean) {
    return isBinaryPreview ? Math.min(initialSize, 184) : initialSize;
}
