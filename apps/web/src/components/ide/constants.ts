import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";

export const SQL_DIALECT_LABEL: Record<SqlDialect, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  mssql: "SQL Server",
};

export const IDE_LANGUAGES = [
  "python",
  "java",
  "javascript",
  "c",
  "cpp",
  "sql",
] as const satisfies readonly CodeLanguage[];

export const ACTION_BTN_CLASS = "ui-btn ui-btn-secondary";
export const CHIP_BTN_CLASS =
  "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition";
export const PANEL_CARD_CLASS =
  "rounded-none border border-neutral-200 bg-white shadow-sm sm:rounded-xl dark:border-white/10 dark:bg-white/[0.04]";
