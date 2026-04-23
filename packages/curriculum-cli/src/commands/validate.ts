
import { validateDraftSubject } from "@zoeskoul/curriculum-compiler";

export async function runValidateDraft(subjectSlug: string) {
  const result = await validateDraftSubject(subjectSlug);

  if (!result.ok) {
    throw new Error(
        `Draft validation failed for ${subjectSlug}:\n${result.issues
            .map((x) => `- ${x}`)
            .join("\n")}`,
    );
  }
}