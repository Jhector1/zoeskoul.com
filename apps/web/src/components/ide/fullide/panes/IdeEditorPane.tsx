"use client";

import CodeRunner from "@/components/code/CodeRunner";

import TabsBar from "../TabsBar";
import { PANEL_CARD_CLASS } from "../../constants";
import { cn } from "../../utils";

type Props = {
  panelRef: React.RefObject<HTMLDivElement | null>;
  nodes: any[];
  tabFiles: any[];
  activeFileId: string | null;
  activeFile: any | null;
  runnerHeight: number;
  title: string;
  isSql: boolean;
  language: any;
  sqlDialect: any;
  onChangeLanguage: (language: any) => void;
  onChangeCode: (code: string) => void;
  onChangeSqlDialect: (dialect: any) => void;
  onRun: (args: any) => Promise<any>;
  setActiveFileId: (id: string | null) => void;
  closeTab: (id: string) => void;
  isDesktop: boolean;
};

export default function IdeEditorPane({
                                        panelRef,
                                        nodes,
                                        tabFiles,
                                        activeFileId,
                                        activeFile,
                                        runnerHeight,
                                        title,
                                        isSql,
                                        language,
                                        sqlDialect,
                                        onChangeLanguage,
                                        onChangeCode,
                                        onChangeSqlDialect,
                                        onRun,
                                        setActiveFileId,
                                        closeTab,
                                        isDesktop,
                                      }: Props) {
  return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-1">
        <div className={PANEL_CARD_CLASS}>
          <TabsBar
              nodes={nodes}
              tabFiles={tabFiles}
              activeFileId={activeFileId}
              setActiveFileId={setActiveFileId}
              closeTab={closeTab}
          />
        </div>

        <div ref={panelRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {activeFile ? (
              <div className={cn("h-full overflow-hidden px-2 pt-2", PANEL_CARD_CLASS)}>
                <CodeRunner
                    frame="plain"
                    title={isSql ? `SQL · ${title}` : title}
                    height={runnerHeight}
                    language={language}
                    onChangeLanguage={onChangeLanguage}
                    code={activeFile.content}
                    onChangeCode={onChangeCode}
                    sqlDialect={sqlDialect}
                    onChangeSqlDialect={onChangeSqlDialect}
                    showLanguagePicker={false}
                    showSqlDialectPicker
                    allowReset={isDesktop}
                    allowRun
                    showEditorThemeToggle={false}
                    showTerminalDockToggle={isDesktop}
                    resetTerminalOnRun={true}
                    onRun={onRun}
                    editorModelKey={activeFileId ?? "no-file"}
                />
              </div>
          ) : (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-none border border-dashed border-neutral-300 bg-white p-6 text-sm font-extrabold text-neutral-600 sm:rounded-xl dark:border-white/10 dark:bg-black/30 dark:text-white/70">
                {isSql ? "No SQL file selected." : "No file selected."}
              </div>
          )}
        </div>
      </div>
  );
}