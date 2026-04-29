import type { FSNode, FileNode, FolderNode, WorkspaceStateV2, NodeId } from "./types";
import { uid } from "./utils";
import {
    defaultMainFile,
    defaultMainCode,
    defaultSqlSchemaCode,
    defaultSqlSeedCode,
    defaultWebCssCode,
    defaultWebJsCode,
} from "./languageDefaults";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import {FileWorkspaceLanguage, NonSqlWorkspaceLanguage} from "@zoeskoul/code-contracts";
import {
    getWorkspaceBody,
    putWorkspaceBody,
    deleteWorkspaceBody,
} from "./workspaceHook/workspace.idb";

export const STORAGE_KEY_V2 = `${process.env.NEXT_PUBLIC_APP_NAME}.ide.workspace.v2`;
export const STORAGE_KEY_V1 = `${process.env.NEXT_PUBLIC_APP_NAME}.ide.workspace.v1`;

const MIN_LEFT_PCT = 16;
const MAX_LEFT_PCT = 40;

export function storageKeyForLanguage(baseKey: string, language: WorkspaceLanguage) {
    return `${baseKey}:${language}`;
}

function encodeStoragePart(value: string) {
    return encodeURIComponent(value);
}

export function legacyStorageKeyForWorkspace(args: {
    baseKey: string;
    language: WorkspaceLanguage;
    actorKey?: string | null;
    projectId?: string | null;
    scopeKey?: string | null;
    localWorkspaceId?: string | null;
}) {
    const actorPart = args.actorKey?.trim() || "anonymous";
    const scopePart = args.scopeKey?.trim() || "global";
    const workspacePart =
        args.projectId?.trim() || args.localWorkspaceId?.trim() || "local";

    return `${args.baseKey}:${actorPart}:${scopePart}:${workspacePart}:${args.language}`;
}

export function storageKeyForWorkspace(args: {
    baseKey: string;
    language: WorkspaceLanguage;
    actorKey?: string | null;
    projectId?: string | null;
    scopeKey?: string | null;
    localWorkspaceId?: string | null;
}) {
    const actorPart = encodeStoragePart(args.actorKey?.trim() || "anonymous");
    const scopePart = encodeStoragePart(args.scopeKey?.trim() || "global");
    const workspacePart = encodeStoragePart(
        args.projectId?.trim() || args.localWorkspaceId?.trim() || "local",
    );

    return `${args.baseKey}:${actorPart}:${scopePart}:${workspacePart}:${args.language}`;
}

function now() {
    return Date.now();
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, fallback = "") {
    return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback: number) {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function buildDefaultFileWorkspace(language: FileWorkspaceLanguage): WorkspaceStateV2 {
    const rootSrcId = uid();
    const mainId = uid();
    const t = now();

    const nodes: FSNode[] = [
        {
            id: rootSrcId,
            kind: "folder",
            name: "src",
            parentId: null,
            createdAt: t,
            updatedAt: t,
        },
        {
            id: mainId,
            kind: "file",
            name: defaultMainFile(language),
            parentId: rootSrcId,
            content: defaultMainCode(language),
            createdAt: t,
            updatedAt: t,
        },
    ];

    return {
        version: 2,
        language,
        nodes,
        openTabs: [mainId],
        activeFileId: mainId,
        entryFileId: mainId,
        stdin: "",
        expanded: [rootSrcId],
        leftPct: 26,
    };
}
function buildDefaultWebWorkspace(): WorkspaceStateV2 {
    const htmlId = uid();
    const cssId = uid();
    const jsId = uid();
    const t = now();

    const nodes: FSNode[] = [
        {
            id: htmlId,
            kind: "file",
            name: "index.html",
            parentId: null,
            content: defaultMainCode("web"),
            createdAt: t,
            updatedAt: t,
        },
        {
            id: cssId,
            kind: "file",
            name: "styles.css",
            parentId: null,
            content: defaultWebCssCode(),
            createdAt: t,
            updatedAt: t,
        },
        {
            id: jsId,
            kind: "file",
            name: "script.js",
            parentId: null,
            content: defaultWebJsCode(),
            createdAt: t,
            updatedAt: t,
        },
    ];

    return {
        version: 2,
        language: "web",
        nodes,
        openTabs: [htmlId, cssId, jsId],
        activeFileId: htmlId,
        entryFileId: htmlId,
        stdin: "",
        expanded: [],
        leftPct: 26,
    };
}

function buildDefaultSqlWorkspace(): WorkspaceStateV2 {
    const schemaId = uid();
    const seedId = uid();
    const queryId = uid();
    const t = now();

    const nodes: FSNode[] = [
        {
            id: schemaId,
            kind: "file",
            name: "schema.sql",
            parentId: null,
            content: defaultSqlSchemaCode(),
            createdAt: t,
            updatedAt: t,
        },
        {
            id: seedId,
            kind: "file",
            name: "seed.sql",
            parentId: null,
            content: defaultSqlSeedCode(),
            createdAt: t,
            updatedAt: t,
        },
        {
            id: queryId,
            kind: "file",
            name: "query.sql",
            parentId: null,
            content: defaultMainCode("sql"),
            createdAt: t,
            updatedAt: t,
        },
    ];

    return {
        version: 2,
        language: "sql",
        nodes,
        openTabs: [queryId],
        activeFileId: queryId,
        entryFileId: queryId,
        stdin: "",
        expanded: [],
        leftPct: 26,
    };
}

export function buildDefaultWorkspace(language: WorkspaceLanguage): WorkspaceStateV2 {
    if (language === "sql") return buildDefaultSqlWorkspace();
    if (language === "web") return buildDefaultWebWorkspace();
    return buildDefaultFileWorkspace(language);
}

function normalizeNode(raw: unknown): FSNode | null {
    if (!isRecord(raw)) return null;

    const kind = raw.kind;
    const id = asString(raw.id);
    const name = asString(raw.name).trim();
    const parentIdRaw = raw.parentId;
    const parentId =
        typeof parentIdRaw === "string" && parentIdRaw.trim()
            ? parentIdRaw
            : null;

    if (!id || !name) return null;

    const createdAt = asNumber(raw.createdAt, now());
    const updatedAt = asNumber(raw.updatedAt, createdAt);

    if (kind === "folder") {
        const node: FolderNode = {
            id,
            kind: "folder",
            name,
            parentId,
            createdAt,
            updatedAt,
        };
        return node;
    }

    if (kind === "file") {
        const node: FileNode = {
            id,
            kind: "file",
            name,
            parentId,
            content: asString(raw.content),
            createdAt,
            updatedAt,
        };
        return node;
    }

    return null;
}

function dedupe<T extends string>(arr: T[]) {
    const seen = new Set<T>();
    const out: T[] = [];

    for (const v of arr) {
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }

    return out;
}

export function repairWorkspaceStateV2(
    raw: unknown,
    fallbackLanguage: WorkspaceLanguage = "python",
): WorkspaceStateV2 {
    if (!isRecord(raw)) return buildDefaultWorkspace(fallbackLanguage);

    const language = ((): WorkspaceLanguage => {
        const v = raw.language;
        if (
            v === "python" ||
            v === "java" ||
            v === "javascript" ||
            v === "c" ||
            v === "cpp" ||
            v === "bash" ||
            v === "sql" ||
            v === "web"
        ) {
            return v;
        }
        return fallbackLanguage;
    })();

    const normalizedNodes = Array.isArray(raw.nodes)
        ? (raw.nodes.map(normalizeNode).filter(Boolean) as FSNode[])
        : [];

    const seenIds = new Set<string>();
    const uniqueNodes: FSNode[] = [];
    for (const n of normalizedNodes) {
        if (seenIds.has(n.id)) continue;
        seenIds.add(n.id);
        uniqueNodes.push(n);
    }

    const byId = new Map<NodeId, FSNode>(uniqueNodes.map((n) => [n.id, n]));
    const repairedNodes = uniqueNodes.map((n) => {
        const badParent =
            n.parentId != null &&
            (n.parentId === n.id || !byId.has(n.parentId));

        return badParent ? { ...n, parentId: null } : n;
    });

    let nodes = repairedNodes;
    let fileNodes = nodes.filter((n): n is FileNode => n.kind === "file");
    let folderNodes = nodes.filter((n): n is FolderNode => n.kind === "folder");

    if (fileNodes.length === 0) {
        const fresh = buildDefaultWorkspace(language);
        nodes = fresh.nodes;
        fileNodes = fresh.nodes.filter((n): n is FileNode => n.kind === "file");
        folderNodes = fresh.nodes.filter((n): n is FolderNode => n.kind === "folder");
    }

    const fileIds = new Set(fileNodes.map((n) => n.id));
    const folderIds = new Set(folderNodes.map((n) => n.id));

    const rawOpenTabs = Array.isArray(raw.openTabs) ? raw.openTabs : [];
    const openTabs = dedupe(
        rawOpenTabs.filter((id): id is NodeId => typeof id === "string" && fileIds.has(id)),
    );

    const fallbackActive = openTabs[0] ?? fileNodes[0].id;

    const activeFileId =
        typeof raw.activeFileId === "string" && fileIds.has(raw.activeFileId)
            ? raw.activeFileId
            : fallbackActive;

    const entryFileId =
        typeof raw.entryFileId === "string" && fileIds.has(raw.entryFileId)
            ? raw.entryFileId
            : activeFileId;

    const finalOpenTabs = openTabs.length ? openTabs : [activeFileId];
    if (!finalOpenTabs.includes(activeFileId)) finalOpenTabs.unshift(activeFileId);

    const rawExpanded = Array.isArray(raw.expanded) ? raw.expanded : [];
    const expanded = dedupe(
        rawExpanded.filter((id): id is NodeId => typeof id === "string" && folderIds.has(id)),
    );

    return {
        version: 2,
        language,
        nodes,
        openTabs: finalOpenTabs,
        activeFileId,
        entryFileId,
        stdin: asString(raw.stdin),
        expanded,
        leftPct: clamp(asNumber(raw.leftPct, 26), MIN_LEFT_PCT, MAX_LEFT_PCT),
    };
}

function loadLegacyV2FromLocalStorage(
    storageKey: string,
    fallbackLanguage: WorkspaceLanguage = "python",
): WorkspaceStateV2 | null {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        return repairWorkspaceStateV2(JSON.parse(raw), fallbackLanguage);
    } catch {
        return null;
    }
}

function saveLegacyV2ToLocalStorage(storageKey: string, ws: WorkspaceStateV2) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(ws));
    } catch {}
}

function removeLegacyV2FromLocalStorage(storageKey: string) {
    try {
        localStorage.removeItem(storageKey);
    } catch {}
}

export async function loadV2(
    storageKey: string,
    fallbackLanguage: WorkspaceLanguage = "python",
): Promise<WorkspaceStateV2 | null> {
    try {
        const fromIdb = await getWorkspaceBody(storageKey);
        if (fromIdb) {
            return repairWorkspaceStateV2(fromIdb, fallbackLanguage);
        }
    } catch {
        // fall through to legacy
    }

    const legacy = loadLegacyV2FromLocalStorage(storageKey, fallbackLanguage);
    if (!legacy) return null;

    try {
        await putWorkspaceBody(storageKey, legacy);
        removeLegacyV2FromLocalStorage(storageKey);
    } catch {
        // keep legacy copy if IDB write fails
    }

    return legacy;
}

export async function saveV2(storageKey: string, ws: WorkspaceStateV2) {
    const safe = repairWorkspaceStateV2(ws, ws.language);

    try {
        await putWorkspaceBody(storageKey, safe);
        removeLegacyV2FromLocalStorage(storageKey);
        return;
    } catch {
        // fallback for browsers where IDB fails unexpectedly
    }

    saveLegacyV2ToLocalStorage(storageKey, safe);
}

export async function deleteV2(storageKey: string) {
    try {
        await deleteWorkspaceBody(storageKey);
    } catch {}

    removeLegacyV2FromLocalStorage(storageKey);
}

function buildCodeWorkspaceFromV1(
    v1: any,
    language: FileWorkspaceLanguage,
): WorkspaceStateV2 | null {
    const rootSrcId = uid();
    const t = now();

    const files = Array.isArray(v1?.files) ? v1.files : [];
    if (!files.length) return null;

    const nodes: FSNode[] = [
        {
            id: rootSrcId,
            kind: "folder",
            name: "src",
            parentId: null,
            createdAt: t,
            updatedAt: t,
        },
        ...files.map((f: any) => ({
            id: uid(),
            kind: "file" as const,
            name: String(f?.name ?? defaultMainFile(language)),
            parentId: rootSrcId,
            content: String(f?.content ?? defaultMainCode(language)),
            createdAt: t,
            updatedAt: t,
        })),
    ];

    const firstFile = nodes.find((n): n is FileNode => n.kind === "file");
    if (!firstFile) return null;

    return {
        version: 2,
        language,
        nodes,
        openTabs: [firstFile.id],
        activeFileId: firstFile.id,
        entryFileId: firstFile.id,
        stdin: typeof v1?.stdin === "string" ? v1.stdin : "",
        expanded: [rootSrcId],
        leftPct: 26,
    };
}

export function tryMigrateV1(
    fallbackLanguage: WorkspaceLanguage = "python",
): WorkspaceStateV2 | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_V1);
        if (!raw) return null;

        const v1 = JSON.parse(raw) as any;
        const language: WorkspaceLanguage =
            v1?.language === "python" ||
            v1?.language === "java" ||
            v1?.language === "javascript" ||
            v1?.language === "c" ||
            v1?.language === "cpp" ||
            v1?.language === "bash" ||
            v1?.language === "sql" ||
            v1?.language === "web"
                ? v1.language
                : fallbackLanguage;

        if (language === "sql") {
            return buildDefaultSqlWorkspace();
        }

        if (language === "web") {
            return buildDefaultWebWorkspace();
        }

        const migrated = buildCodeWorkspaceFromV1(v1, language);
        return migrated ? repairWorkspaceStateV2(migrated, language) : null;
    } catch {
        return null;
    }
}