import { SUBJECT_GENERATOR_SOURCES } from "@/lib/subjects/subjects.generated";

type TopicManifest = {
  topicId: string;
  cards?: TopicCard[];
  exercises?: Array<{ id?: string }>;
};

type TopicCard = {
  id?: string;
  kind?: string;
  type?: string;
  project?: { steps?: Array<{ id?: string; exerciseKey?: string }> };
  spec?: { steps?: Array<{ id?: string; exerciseKey?: string }> };
};

const SUBJECT_TOPIC_MANIFESTS: Record<string, Record<string, TopicManifest>> =
  Object.fromEntries(
    Object.entries(SUBJECT_GENERATOR_SOURCES).map(([subjectSlug, source]) => [
      subjectSlug,
      source.topicManifests as Record<string, TopicManifest>,
    ]),
  );

function getProjectSteps(card: TopicCard) {
  return card.project?.steps ?? card.spec?.steps ?? [];
}

const issues: string[] = [];

for (const [subjectSlug, manifests] of Object.entries(SUBJECT_TOPIC_MANIFESTS)) {
  for (const [topicKey, topicBundle] of Object.entries(manifests)) {
    const exerciseIds = new Set(
      (topicBundle.exercises ?? [])
        .map((exercise) => String(exercise?.id ?? "").trim())
        .filter(Boolean),
    );

    for (const card of topicBundle.cards ?? []) {
      const cardKind = card.kind ?? card.type;
      if (cardKind !== "project") continue;

      for (const step of getProjectSteps(card)) {
        const stepId = String(step?.id ?? "").trim() || "unknown-step";
        const exerciseKey = String(step?.exerciseKey ?? "").trim();

        if (!exerciseKey) {
          issues.push(
            `${subjectSlug}/${topicKey}/${String(card.id ?? "project")} step "${stepId}" is missing exerciseKey`,
          );
          continue;
        }

        if (!exerciseIds.has(exerciseKey)) {
          issues.push(
            `${subjectSlug}/${topicKey}/${String(card.id ?? "project")} step "${stepId}" points to missing exerciseKey "${exerciseKey}"`,
          );
        }
      }
    }
  }
}

if (issues.length > 0) {
  console.error("Project manifest binding audit failed:\n");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Project manifest binding audit passed.");
