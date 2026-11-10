"use client";
import type { FSNode, InlineEdit } from "@zoeskoul/learner-workspace/ide/types";
import { resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
import type { WorkspaceExplorerIntentV6 } from "@zoeskoul/learner-workspace/runner/runtime";

/** No UI mutation here. A V6 intent must be acknowledged by the remote worker first. */
function requireName(raw: string): string {
    const name = raw.trim();
    if (!name || name === "." || name === ".." || name.includes("/") ||
        name.includes("\\") || name.includes("\0") || name.startsWith(".zoe-")) {
        throw new Error("V6 requires a single, safe filename or folder name.");
    }
    return name;
}
function node(nodes: FSNode[], id: string) {
    const item = nodes.find((entry) => entry.id === id);
    if (!item) throw new Error("Workspace changed; refresh the file explorer.");
    return item;
}
function fullPath(nodes: FSNode[], itemId: string): string {
    const segments = [] as string[];
    let item = node(nodes, itemId);
    const seen = new Set<string>();
    while (item) {
        if (seen.has(item.id)) throw new Error("Folder cycle detected.");
        seen.add(item.id);
        segments.unshift(requireName(item.name));
        if (item.parentId == null) break;
        item = node(nodes, item.parentId);
    }
    return segments.join("/");
}
function checkDestination(nodes: FSNode[], parentId: string|null, name: string, exceptId?: string) {
    if (nodes.some((item) => item.parentId === parentId && item.id !== exceptId &&
        item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error("A file or folder with this name already exists.");
    }
}
export function planV6InlineIntent(nodes: FSNode[], edit: InlineEdit): WorkspaceExplorerIntentV6|null {
    if (!edit) return null;
    const name = requireName(edit.value);
    if (edit.mode === "new-file") {
        if (edit.parentId && node(nodes,edit.parentId).kind !== "folder") {
            throw new Error("Invalid parent folder.");
        }
        checkDestination(nodes,edit.parentId,name);
        const path = edit.parentId ? `${fullPath(nodes,edit.parentId)}/${name}` : name;
        if (resolveWorkspaceFileCapability(path)?.storage !== "text") {
            throw new Error("Create a supported text file; binary files must be uploaded.");
        }
        return {kind:"create_file",path};
    }
    if (edit.mode === "new-folder") {
        if (edit.parentId) {
            const parent = node(nodes, edit.parentId);
            if (parent.kind !== "folder") throw new Error("Invalid parent folder.");
        }
        checkDestination(nodes, edit.parentId, name);
        return {kind:"mkdir",path:edit.parentId?`${fullPath(nodes,edit.parentId)}/${name}`:name};
    }
    if (!edit.targetId) throw new Error("Missing rename target.");
    const target = node(nodes,edit.targetId);
    if (target.name===name) return null;
    checkDestination(nodes,target.parentId,name,target.id);
    const previous=fullPath(nodes,target.id);
    const next=target.parentId?`${fullPath(nodes,target.parentId)}/${name}`:name;
    if(target.kind==="file") {
        const oldCapability=resolveWorkspaceFileCapability(previous);
        const newCapability=resolveWorkspaceFileCapability(next);
        if (!oldCapability || !newCapability || oldCapability.storage!==newCapability.storage ||
            (target.binary?"binary":"text")!==newCapability.storage) {
            throw new Error("File rename must preserve its text or binary format.");
        }
        return {kind:"move_file",path:previous,destinationPath:next};
    }
    return {kind:"move_directory",path:previous,destinationPath:next};
}
export function planV6MoveIntent(nodes: FSNode[], id:string, parentId:string|null):WorkspaceExplorerIntentV6|null {
    const item=node(nodes,id);
    if (item.parentId===parentId) return null;
    if (parentId!==null && node(nodes,parentId).kind!=="folder") throw new Error("Invalid destination folder.");
    const src=fullPath(nodes,id);
    const parent=parentId?fullPath(nodes,parentId):"";
    if (item.kind==="folder" && parent.startsWith(`${src}/`)) throw new Error("Cannot move a folder into itself.");
    const destination=parent?`${parent}/${requireName(item.name)}`:requireName(item.name);
    checkDestination(nodes,parentId,item.name,item.id);
    return item.kind==="file"
        ? {kind:"move_file",path:src,destinationPath:destination}
        : {kind:"move_directory",path:src,destinationPath:destination};
}
export function planV6DeleteIntent(nodes:FSNode[],id:string):WorkspaceExplorerIntentV6 {
    const item=node(nodes,id);
    return item.kind==="file"
        ? {kind:"delete_file",path:fullPath(nodes,id)}
        : {kind:"trash_directory",path:fullPath(nodes,id)};
}
