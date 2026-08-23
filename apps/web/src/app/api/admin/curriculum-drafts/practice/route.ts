import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";

import { isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";
import { loadDraftQaPractice } from "@/lib/dev/curriculumDrafts/practiceQa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function required(search: URLSearchParams, key: string) {
  const value = search.get(key)?.trim() ?? "";
  if (!value) throw new Error(`Missing ${key}.`);
  return value;
}

async function handleGET(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const practice = await loadDraftQaPractice({
      ref: {
        catalog: required(url.searchParams, "draftCatalog"),
        subject: required(url.searchParams, "draftSubject"),
        module: required(url.searchParams, "draftModule"),
        topic: required(url.searchParams, "draftTopic"),
        locale: url.searchParams.get("draftLocale")?.trim() || "en",
      },
      exerciseKey: required(url.searchParams, "exerciseKey"),
      difficulty: url.searchParams.get("difficulty") ?? "easy",
    });

    return NextResponse.json({
      exercise: practice.exercise,
      key: practice.key,
      sessionId: null,
      run: {
        allowReveal: true,
        showDebug: true,
        maxAttempts: practice.maxAttempts,
        help: null,
      },
      meta: {
        draftQa: true,
        source: "curriculum-drafts",
        topic: practice.topicSlug,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load Draft QA practice exercise.",
      },
      { status: 400 },
    );
  }
}

export function GET(request: Request) {
  return runAdminCurriculumDraftRoute(
    request,
    () => handleGET(request),
  );
}

export function OPTIONS(request: Request) {
  return adminCurriculumDraftOptions(request);
}
