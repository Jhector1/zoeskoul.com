"use client";

import ExplorerTree from "../ExplorerTree";
import { SQL_DIALECT_LABEL } from "../../constants";
"use client";

import type { SqlDialect } from "@/lib/practice/types";
import {CreateNodeHandler} from "@/components/ide/workspaceHook/workspace.types";


type Props = {
  isSql: boolean;
  sqlDialect: SqlDialect;
  entryPath: string;
  upgradeText: string | null;
  filter: string;
  nodes: any[];
  expanded: any;
  activeFileId: string;
  entryFileId: string ;
  language: string;
  inlineEdit: any;
  stdin: string;
  onUpgrade: () => void;
  onChangeFilter: (value: string) => void;
  onChangeStdin: (value: string) => void;
  actions: {
    setInlineEdit: (value: any) => void;
    openFile: (id: string) => void;
    toggleFolder: (id: string) => void;
    startNewFile: CreateNodeHandler;
    startNewFolder:CreateNodeHandler;
    startRename: (id: string) => void;
    setEntry: (id: string) => void;
    requestDelete: (id: string) => void;
    commitInlineEdit: (...args: any[]) => void;
    cancelInlineEdit: () => void;
  };
};
export default function IdeExplorerPane({
  isSql,
  sqlDialect,
  entryPath,
  upgradeText,
  filter,
  nodes,
  expanded,
  activeFileId,
  entryFileId,
  language,
  inlineEdit,
  stdin,
  onUpgrade,
  onChangeFilter,
  onChangeStdin,
  actions,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50/70 dark:bg-black/20">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-3 dark:border-white/10">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
          {isSql ? "SQL Workspace" : "Explorer"}
        </div>

        <div className="min-w-0 text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
          {isSql ? (
            <span className="truncate text-neutral-800 dark:text-white/80">{SQL_DIALECT_LABEL[sqlDialect]}</span>
          ) : (
            <>
              <span className="hidden sm:inline">entry: </span>
              <span className="truncate text-neutral-800 dark:text-white/80">{entryPath}</span>
            </>
          )}
        </div>
      </div>

      <div className="border-b border-neutral-200 p-3 dark:border-white/10">
        <input
          value={filter}
          onChange={(e) => onChangeFilter(e.target.value)}
          placeholder={isSql ? "Filter SQL files…" : "Filter files…"}
          className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/80"
        />
      </div>

      {upgradeText ? (
        <div className="border-b border-neutral-200 px-3 py-3 dark:border-white/10">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            {upgradeText}
            <div className="mt-2">
              <button type="button" onClick={onUpgrade} className="ui-btn ui-btn-secondary">
                Upgrade
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <ExplorerTree
          nodes={nodes}
          expanded={expanded}
          activeFileId={activeFileId }
          entryFileId={entryFileId}
          isSql={language === "sql"}
          filter={filter}
          inlineEdit={inlineEdit}
          setInlineEdit={actions.setInlineEdit}
          openFile={actions.openFile}
          toggleFolder={actions.toggleFolder}
          startNewFile={actions.startNewFile}
          startNewFolder={actions.startNewFolder}
          startRename={actions.startRename}
          setEntry={actions.setEntry}
          requestDelete={actions.requestDelete}
          commitInlineEdit={actions.commitInlineEdit}
          cancelInlineEdit={actions.cancelInlineEdit}
        />
      </div>

      {isSql ? (
        <div className="border-t border-neutral-200 p-3 dark:border-white/10">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
            SQL Mode
          </div>
          <div className="mt-2 space-y-2 text-xs font-semibold text-neutral-600 dark:text-white/60">
            <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
              Active dialect: <span className="font-black text-neutral-900 dark:text-white/85">{SQL_DIALECT_LABEL[sqlDialect]}</span>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
              SQL runs use the current editor file as the query source and show structured query results in the output pane.
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-neutral-200 p-3 dark:border-white/10">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
            Shared stdin
          </div>
          <textarea
            value={stdin}
            onChange={(e) => onChangeStdin(e.target.value)}
            placeholder="Shared input…"
            className="mt-2 h-28 w-full resize-none rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/80"
          />
        </div>
      )}
    </div>
  );
}
