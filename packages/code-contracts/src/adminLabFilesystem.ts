import { z } from "zod";

/** Server-authored expectations, never browser terminal transcripts. */
export function isAdminLabWorkspacePath(value: string): boolean {
  if (typeof value !== "string" || !value.startsWith("/workspace/") || value.length > 180) return false;
  const segments = value.slice("/workspace/".length).split("/");
  return segments.length >= 1 && segments.length <= 6 && segments.every((part) =>
    part.length > 0 && part.length <= 64 && part !== "." && part !== ".." &&
    part !== ".lab-root-password" && /^[A-Za-z0-9._-]+$/.test(part),
  );
}

export const AdminLabFilesystemCheckSchema = z.object({
  path: z.string().refine(isAdminLabWorkspacePath),
  kind: z.enum(["file", "directory"]),
  mode: z.string().regex(/^[0-7]{4}$/).optional(),
  uid: z.number().int().min(0).max(65535).optional(),
  gid: z.number().int().min(0).max(65535).optional(),
}).strict();

export const AdminLabFilesystemExpectedSchema = z.object({
  required: z.array(AdminLabFilesystemCheckSchema).min(1).max(8),
}).strict().refine((value) => new Set(value.required.map((item) => item.path)).size === value.required.length,
  {message: "Duplicate filesystem target."});

export type AdminLabFilesystemExpected = z.infer<typeof AdminLabFilesystemExpectedSchema>;
