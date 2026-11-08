import {
  assertWorkspaceRelativePath,
  resolveWorkspaceFileCapability,
} from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import { isWorkspacePreservedPath } from "./runnerManagedWorkspace.js";

export type WorkspaceFileOp = "list" | "read" | "write" | "delete" | "mkdir";
export type WorkspaceFileRequest = Readonly<{
  op: WorkspaceFileOp;
  path: string;
  maxBytes: number;
  expectedRevision?: string | null;
  data?: string;
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
      op !== "delete" && op !== "mkdir") {
    throw new WorkspaceFileInputError("INVALID_REQUEST");
  }
  let path: string;
  if (op === "list" && input.path === "") {
    path = "";
  } else {
    if (typeof input.path !== "string") throw new WorkspaceFileInputError("INVALID_REQUEST");
    try { path = assertWorkspaceRelativePath(input.path); }
    catch { throw new WorkspaceFileInputError("INVALID_REQUEST"); }
  }
  if (path && (isWorkspacePreservedPath(path) ||
      path.split("/").some(part => part === "node_modules" || part === ".next" ||
        part === "dist" || part === "target" || part === "__pycache__" ||
        part.startsWith(".zoe-v6-file-") || part.startsWith(".zoe-sync-")))) {
    throw new WorkspaceFileInputError("INVALID_REQUEST");
  }
  let maxBytes = Math.min(env.maxFileBytes, 5 * 1024 * 1024);
  if (op === "read" || op === "write" || op === "delete") {
    const capability = resolveWorkspaceFileCapability(path);
    if (!capability) throw new WorkspaceFileInputError("INVALID_REQUEST");
    maxBytes = Math.min(capability.storage === "binary" ? env.maxBinaryFileBytes : env.maxFileBytes, 5 * 1024 * 1024);
  }
  if (op === "write" || op === "delete") {
    if (!Object.prototype.hasOwnProperty.call(input, "expectedRevision")) {
      throw new WorkspaceFileInputError("PRECONDITION_REQUIRED");
    }
    const expected = input.expectedRevision;
    if (expected !== null && (typeof expected !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(expected))) {
      throw new WorkspaceFileInputError("INVALID_REQUEST");
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
