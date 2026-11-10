/**
 * One stable create request per tab draft, surviving uncertain responses and
 * page refresh. Only the caller may clear it after a validated cloud ACK.
 * Never store the workspace in localStorage: it already lives in IndexedDB.
 */
export function getOrCreateCreationIntent(
    storage: Pick<Storage, "getItem" | "setItem"> | null,
    key: string,
    generate: () => string,
): string {
    if (!storage) throw new Error("Browser storage is unavailable. Download a project ZIP before creating a cloud project.");
    const previous = storage.getItem(key);
    if (previous && /^[A-Za-z0-9_-]{20,96}$/.test(previous)) return previous;
    const created = generate();
    if (!/^[A-Za-z0-9_-]{20,96}$/.test(created)) throw new Error("Cannot generate a secure project creation key.");
    storage.setItem(key, created); // fail closed: no untracked, possibly duplicated POST
    return created;
}

export function clearAcknowledgedCreationIntent(
    storage: Pick<Storage, "getItem" | "removeItem"> | null,
    key: string,
    acknowledged: string,
): void {
    if (storage?.getItem(key) === acknowledged) storage.removeItem(key);
}
