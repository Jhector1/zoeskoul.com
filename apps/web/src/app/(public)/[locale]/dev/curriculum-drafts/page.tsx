import { notFound } from "next/navigation";
import CurriculumDraftEditor from "@/components/dev/curriculum-drafts/CurriculumDraftEditor";
import { isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";

export const dynamic = "force-dynamic";

export default function CurriculumDraftsDevPage() {
  if (!isCurriculumDraftEditorEnabled()) {
    notFound();
  }

  return <CurriculumDraftEditor />;
}
