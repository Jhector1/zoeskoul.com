"use client";

import ScopedAdminLabTerminal from "@/components/tools/panes/ScopedAdminLabTerminal";

type DraftRef = {catalog: "linux"; subject: "linux"; module: string; topic: string};

/** Compatibility wrapper for the existing author-only QA route. */
export default function DraftAdminLabQaPanel({draft}: {draft: DraftRef}) {
  return <ScopedAdminLabTerminal selection={{kind: "draft", draft}} />;
}
