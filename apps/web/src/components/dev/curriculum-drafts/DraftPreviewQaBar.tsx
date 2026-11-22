"use client";

import { getLocalAppOrigin, getProductionAppOrigin } from "@zoeskoul/app-config";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";
import { approvedDraftAdminQaSelection } from "@/lib/dev/curriculumDrafts/adminLabQaClientSelection";
import { DRAFT_QA_REVIEW_ROUTE_CHANGED } from "@/components/review/module/navigation/draftQaNavigationSearch";

export default function DraftPreviewQaBar() {
  const params = useParams<{ locale?: string }>();
  const searchParams = useSearchParams();
  const locale = params?.locale ?? "en";
  // The review player changes lessons with history.pushState/replaceState, not
  // necessarily a Next navigation. Follow its explicit route-change signal.
  const [liveSearch, setLiveSearch] = React.useState<string | null>(null);
  React.useEffect(() => {
    const sync = () => setLiveSearch(window.location.search);
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener(DRAFT_QA_REVIEW_ROUTE_CHANGED, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(DRAFT_QA_REVIEW_ROUTE_CHANGED, sync);
    };
  }, []);
  const currentSearch = liveSearch ?? searchParams.toString();
  const selectedDraft = React.useMemo(
    () => approvedDraftAdminQaSelection(currentSearch), [currentSearch],
  );
  const editorQuery = new URLSearchParams();
  const selectedQuery = new URLSearchParams(currentSearch);

  for (const [previewKey, editorKey] of [
    ["catalog", "catalog"],
    ["subject", "subject"],
    ["moduleDir", "module"],
    ["topicDir", "topic"],
  ] as const) {
    const value = selectedQuery.get(previewKey);
    if (value) editorQuery.set(editorKey, value);
  }

  const editorQueryString = editorQuery.toString();
  const draft = selectedDraft;
  const local =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  const adminOrigin = local
    ? getLocalAppOrigin("admin")
    : getProductionAppOrigin("admin");
  const editorPath = `/curriculum${
    editorQueryString ? `?${editorQueryString}` : ""
  }`;
  const editorHref = new URL(editorPath, adminOrigin).toString();

  return (
    <>
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
      <div className="min-w-0">
        <span className="font-bold">Draft QA</span>
        <span className="ml-2 text-emerald-800">
          Progress is local-only, nothing is saved, and all targets are unlocked.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {draft ? <span className="border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold">
          Isolated administrator terminal in the Tools panel · explicit launch required
        </span> : null}
        <button
          type="button"
          className="rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-emerald-100"
          onClick={() => window.location.reload()}
          title="Reload the latest saved .curriculum-build files and reset local QA progress"
        >
          Reload saved draft
        </button>
        <a
          className="rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-emerald-100"
          href={editorHref}
          target="_blank"
          rel="noreferrer"
        >
          Draft editor
        </a>
      </div>
    </div>
    </>
  );
}
