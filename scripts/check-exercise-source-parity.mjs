import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function must(condition, message) {
  if (!condition) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
}

const web = read(
  "apps/web/src/components/practice/review/StandaloneReviewExerciseCard.tsx",
);
const student = read(
  "apps/student/src/legacy-web/components/practice/review/StandaloneReviewExerciseCard.tsx",
);
const helper = read(
  "packages/learning-runtime/src/review/module/runtime/resolveReviewExerciseSourceCoordinates.ts",
);

for (const [name, source] of [
  ["web", web],
  ["student", student],
]) {
  must(
    source.includes("resolveReviewExerciseSourceCoordinates"),
    `${name} standalone exercise adapter does not use shared review source coordinates`,
  );
  must(
    source.includes("sourceCoordinates.sectionSlug") &&
      source.includes("sourceCoordinates.topicSlug"),
    `${name} standalone exercise adapter does not pass canonical section/topic`,
  );
  must(
    !source.includes("section: props.section || undefined"),
    `${name} reintroduced Practice-only q.fetch section derivation`,
  );
  must(
    !source.includes('topicId: firstText(props.exercise.topic, props.topic, "all")'),
    `${name} reintroduced Practice-only PracticeState topic identity`,
  );
}

must(
  web === student,
  "Web/Student standalone exercise source adapters drifted",
);

must(
  helper.includes("selectedTargets") &&
    helper.includes("exerciseKey") &&
    helper.includes("sectionSlug") &&
    helper.includes("topicSlug"),
  "shared review source-coordinate helper lost canonical target resolution",
);

console.log("=== ZOESKOUL EXERCISE SOURCE PARITY CHECK ===");
console.log("lesson_review_standard=QuizPracticeCard");
console.log("standalone_exercise_shell=QuizPracticeCard");
console.log("source_coordinates_owner=packages/learning-runtime");
console.log("practice_direct_section_derivation=absent");
console.log("practice_direct_topic_identity_derivation=absent");
console.log("web_student_source_adapter_parity=yes");
console.log("RESULT=EXERCISE_SOURCE_PARITY_PASS");
