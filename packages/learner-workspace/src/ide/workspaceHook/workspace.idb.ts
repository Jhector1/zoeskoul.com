import { getLearnerWorkspaceEnv, getLearnerWorkspaceStaticConfig } from "@zoeskoul/learner-workspace/runtime/staticConfig";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { createWorkspaceWriteQueue } from "./workspaceWriteQueue";

const DB_NAME = `${getLearnerWorkspaceStaticConfig().appName}.ide.storage`;
const DB_VERSION = 1;
const WORKSPACE_STORE = "workspace_bodies";
const OPEN_TIMEOUT_MS = 4000;

type WorkspaceBodyRecord = {
    key: string;
    savedAt: number;
    workspace: WorkspaceStateV2;
};

let dbPromise: Promise<IDBDatabase> | null = null;
const writeQueue = createWorkspaceWriteQueue();

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

export async function getWorkspaceBodyRecord(
    key: string,
): Promise<WorkspaceBodyRecord | null> {
    if (!canUseIndexedDb()) return null;
    await writeQueue.flush(key);

    const db = await openDb();
    const tx = db.transaction(WORKSPACE_STORE, "readonly");
    const store = tx.objectStore(WORKSPACE_STORE);
    const committed = waitForTransaction(tx);
    const record = await requestToPromise<WorkspaceBodyRecord | undefined>(store.get(key));
    await committed;

    return record ?? null;
}

export async function getWorkspaceBody(key: string): Promise<WorkspaceStateV2 | null> {
    return (await getWorkspaceBodyRecord(key))?.workspace ?? null;
}

export async function putWorkspaceBody(
    key: string,
    workspace: WorkspaceStateV2,
    savedAt = Date.now(),
): Promise<void> {
    if (!canUseIndexedDb()) throw new Error("IndexedDB is unavailable.");
    return writeQueue.enqueue(key, async () => {
        const db = await openDb();
        const tx = db.transaction(WORKSPACE_STORE, "readwrite");
        const store = tx.objectStore(WORKSPACE_STORE);
        const committed = waitForTransaction(tx);
        store.put({key, savedAt, workspace} satisfies WorkspaceBodyRecord);
        await committed;
    });
}

export async function deleteWorkspaceBody(key: string): Promise<void> {
    if (!canUseIndexedDb()) return;
    return writeQueue.enqueue(key, async () => {
        const db = await openDb();
        const tx = db.transaction(WORKSPACE_STORE, "readwrite");
        const committed = waitForTransaction(tx);
        tx.objectStore(WORKSPACE_STORE).delete(key);
        await committed;
    });
}