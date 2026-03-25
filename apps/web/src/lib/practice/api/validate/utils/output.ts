// src/lib/practice/validate/utils/output.ts
export function normOut(s: string) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trimEnd();
}
