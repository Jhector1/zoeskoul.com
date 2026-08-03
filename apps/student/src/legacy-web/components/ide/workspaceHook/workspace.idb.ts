import type { WorkspaceStateV2 } from "../types";

const DB_NAME = `${process.env.NEXT_PUBLIC_APP_NAME ?? "app"}.ide.storage`;
const DB_VERSION = 1;
const WORKSPACE_STORE = "workspace_bodies";
const OPEN_TIMEOUT_MS = 4000;

type WorkspaceBodyRecord = {
    key: string;
    savedAt: number;
    workspace: WorkspaceStateV2;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function canUseIndexedDb() {
    return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const id = window.setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms.`));
        }, ms);

        promise.then(
            (value) => {
                window.clearTimeout(id);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(id);
                reject(error);
            },
        );
    });
}

function openDbInternal(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
                const store = db.createObjectStore(WORKSPACE_STORE, { keyPath: "key" });
                store.createIndex("savedAt", "savedAt", { unique: false });
            }
        };

        req.onblocked = () => {
            reject(new Error("IndexedDB open was blocked"));
        };

        req.onerror = () => {
            reject(req.error ?? new Error("Failed to open IndexedDB."));
        };

        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => {
                db.close();
            };
            resolve(db);
        };
    });
}

function openDb(): Promise<IDBDatabase> {
    if (!canUseIndexedDb()) {
        return Promise.reject(new Error("IndexedDB is not available."));
    }

    if (!dbPromise) {
        dbPromise = withTimeout(
            openDbInternal(),
            OPEN_TIMEOUT_MS,
            "IndexedDB open",
        ).catch((error) => {
            dbPromise = null;
            throw error;
        });
    }

    return dbPromise;
}

function requestToPromise<T = void>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed."));
    });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
    });
}

export async function getWorkspaceBody(
    key: string,
): Promise<WorkspaceStateV2 | null> {
    if (!canUseIndexedDb()) return null;

    const db = await openDb();
    const tx = db.transaction(WORKSPACE_STORE, "readonly");
    const store = tx.objectStore(WORKSPACE_STORE);

    const record = await requestToPromise<WorkspaceBodyRecord | undefined>(store.get(key));
    await waitForTransaction(tx);

    return record?.workspace ?? null;
}

export async function putWorkspaceBody(
    key: string,
    workspace: WorkspaceStateV2,
): Promise<void> {
    if (!canUseIndexedDb()) return;

    const db = await openDb();
    const tx = db.transaction(WORKSPACE_STORE, "readwrite");
    const store = tx.objectStore(WORKSPACE_STORE);

    await requestToPromise(
        store.put({
            key,
            savedAt: Date.now(),
            workspace,
        } satisfies WorkspaceBodyRecord),
    );

    await waitForTransaction(tx);
}

export async function deleteWorkspaceBody(key: string): Promise<void> {
    if (!canUseIndexedDb()) return;

    const db = await openDb();
    const tx = db.transaction(WORKSPACE_STORE, "readwrite");
    const store = tx.objectStore(WORKSPACE_STORE);

    await requestToPromise(store.delete(key));
    await waitForTransaction(tx);
}