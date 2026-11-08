import {
  assertWorkspaceRelativePath,
  resolveWorkspaceFileCapability,
} from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import { isWorkspacePreservedPath } from "./runnerManagedWorkspace.js";

export type WorkspaceFileOp = "list" | "read" | "write" | "delete" | "mkdir" | "move" | "rmdir" | "inspect" | "move_directory" | "trash_directory" | "list_trash" | "restore_directory";
export type WorkspaceFileRequest = Readonly<{
  op: WorkspaceFileOp;
  path: string;
  maxBytes: number;
  expectedRevision?: string | null;
  data?: string;
  destinationPath?: string;
  trashId?: string;
}>;

export class WorkspaceFileInputError extends Error {
  constructor(public readonly code: "INVALID_REQUEST" | "PRECONDITION_REQUIRED" | "TOO_LARGE") {
    super(code);
  }
}

/** The *server* owns limits and workspace capabilities; never trust the client's maxBytes. */
export function parseWorkspaceFileRequest(body: unknown): WorkspaceFileRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkspaceFileInputError("INVALID_REQUEST");
  }
  const input = body as Record<string, unknown>;
  const op = input.op;
  if (op !== "list" && op !== "read" && op !== "write" &&
      op !== "delete" && op !== "mkdir" && op !== "move" && op !== "rmdir" && op !== "inspect" && op !== "move_directory" && op !== "trash_directory" && op !== "list_trash" && op !== "restore_directory") {
    throw new WorkspaceFileInputError("INVALID_REQUEST");
  }
  let path: string;
  if ((op === "list" || op === "list_trash") && input.path === "") {
    path = "";
  } else {
    if (typeof input.path !== "string") throw new WorkspaceFileInputError("INVALID_REQUEST");
    try { path = assertWorkspaceRelativePath(input.path); }
    catch { throw new WorkspaceFileInputError("INVALID_REQUEST"); }
  }
  if (op === "list_trash" && path !== "") throw new WorkspaceFileInputError("INVALID_REQUEST");
  const isForbiddenPath = (value: string) => Boolean(value &&
    (isWorkspacePreservedPath(value) || value.split("/").some(part =>
      part === "node_modules" || part === ".zoe-v6-trash" || part === ".next" || part === "dist" ||
      part === "target" || part === "__pycache__" ||
      part.startsWith(".zoe-v6-file-") || part.startsWith(".zoe-sync-"))));
  if (isForbiddenPath(path)) throw new WorkspaceFileInputError("INVALID_REQUEST");
  let maxBytes = Math.min(env.maxFileBytes, 5 * 1024 * 1024);
  if (op === "read" || op === "write" || op === "delete") {
    const capability = resolveWorkspaceFileCapability(path);
    if (!capability) throw new WorkspaceFileInputError("INVALID_REQUEST");
    maxBytes = Math.min(capability.storage === "binary" ? env.maxBinaryFileBytes : env.maxFileBytes, 5 * 1024 * 1024);
  }
  let destinationPath: string | undefined;
  if (op === "move" || op === "move_directory") {
    if (typeof input.destinationPath !== "string") {
      throw new WorkspaceFileInputError("INVALID_REQUEST");
    }
    try { destinationPath = assertWorkspaceRelativePath(input.destinationPath); }
    catch { throw new WorkspaceFileInputError("INVALID_REQUEST"); }
    if (isForbiddenPath(destinationPath) || destinationPath === path) {
      throw new WorkspaceFileInputError("INVALID_REQUEST");
    }
    // Keep the file and directory move permissions separated.
    const source = resolveWorkspaceFileCapability(path);
    const target = resolveWorkspaceFileCapability(destinationPath);
    if (source && target) {
      maxBytes = Math.min(maxBytes, source.storage === "binary" ?
        env.maxBinaryFileBytes : env.maxFileBytes,
        target.storage === "binary" ? env.maxBinaryFileBytes : env.maxFileBytes);
    }
  }
  if (op === "write" || op === "delete" || op === "move" || op === "rmdir" || op === "move_directory" || op === "trash_directory" || op === "restore_directory") {
    if (!Object.prototype.hasOwnProperty.call(input, "expectedRevision")) {
      throw new WorkspaceFileInputError("PRECONDITION_REQUIRED");
    }
    const expected = input.expectedRevision;
    if (expected !== null && (typeof expected !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(expected))) {
      throw new WorkspaceFileInputError("INVALID_REQUEST");
    }
    if (op === "trash_directory") {
      if (expected === null) throw new WorkspaceFileInputError("PRECONDITION_REQUIRED");
      return { op, path, maxBytes, expectedRevision: expected };
    }
    if (op === "restore_directory") {
      if (expected !== null || typeof input.trashId !== "string" ||
          !/^[a-f0-9]{32}$/.test(input.trashId)) {
        throw new WorkspaceFileInputError("INVALID_REQUEST");
      }
      return { op, path, trashId: input.trashId, maxBytes, expectedRevision: null };
    }
    if (op === "move_directory") {
      // Explicit separate operation: do not weaken file-extension policy for
      // regular `move`. A subtree digest must be read with `inspect` first.
      if (expected === null) throw new WorkspaceFileInputError("PRECONDITION_REQUIRED");
      return { op, path, destinationPath, maxBytes, expectedRevision: expected };
    }
    if (op === "move") {
      if (expected !== null &&
          (!resolveWorkspaceFileCapability(path) ||
           !resolveWorkspaceFileCapability(destinationPath!))) {
        throw new WorkspaceFileInputError("INVALID_REQUEST");
      }
      return { op, path, destinationPath, maxBytes, expectedRevision: expected };
    }
    if (op === "rmdir") {
      if (expected !== null) throw new WorkspaceFileInputError("INVALID_REQUEST");
      return { op, path, maxBytes, expectedRevision: null };
    }
    if (op === "write") {
      if (typeof input.data !== "string") throw new WorkspaceFileInputError("INVALID_REQUEST");
      if (input.data.length > Math.ceil(maxBytes / 3) * 4 + 8) {
        throw new WorkspaceFileInputError("TOO_LARGE");
      }
      return { op, path, maxBytes, expectedRevision: expected, data: input.data };
    }
    return { op, path, maxBytes, expectedRevision: expected };
  }
  return { op, path, maxBytes };
}
