// src/lib/practice/parseModuleMeta.ts
import { ModuleMetaSchema } from "@/seed/data/subjects/_types";

export function parseModuleMeta(meta: unknown) {
  const res = ModuleMetaSchema.safeParse(meta);
  return res.success ? res.data : null;
}