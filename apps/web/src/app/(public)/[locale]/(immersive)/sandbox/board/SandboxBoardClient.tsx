"use client";
import { useMemo } from "react";
import dynamic from "next/dynamic";

const Board = dynamic(() => import("@/components/tools/panes/BoardToolPane"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-[rgb(var(--ui-surface))] text-sm">Loading whiteboard…</div>,
});

export default function SandboxBoardClient({ locale }: { locale: string }) {
  // Keep the existing user-scoped document identity: changing routes must not create a new board.
  const boardKey = useMemo(() => ({
    subjectSlug: "sandbox", moduleId: "standalone", locale,
    toolId: "board", scopeKey: "personal",
  }), [locale]);
  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-[rgb(var(--ui-surface))]">
      <Board boardKey={boardKey}/>
    </div>
  );
}
