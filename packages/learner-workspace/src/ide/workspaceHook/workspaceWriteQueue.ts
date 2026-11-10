/** Serializes local draft writes by storage key (including deletes).
 * A failed write never blocks the next, and the caller still receives the error.
 */
export function createWorkspaceWriteQueue() {
    const active = new Map<string, Promise<void>>();
    return {
        enqueue(key: string, operation: () => Promise<void>): Promise<void> {
            const previous = active.get(key) ?? Promise.resolve();
            const next = previous.catch(() => undefined).then(operation);
            const completed = next.then(() => undefined, () => undefined);
            active.set(key, completed);
            void completed.then(() => {
                if (active.get(key) === completed) active.delete(key);
            });
            return next;
        },
        async flush(key: string) {
            await active.get(key);
        },
    };
}
