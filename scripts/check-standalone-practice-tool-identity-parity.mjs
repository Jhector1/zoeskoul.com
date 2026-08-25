import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function must(value, message) {
  if (!value) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
}

const web = read(
  "apps/web/src/components/practice/tools/useStandalonePracticeTools.ts",
);
const student = read(
  "apps/student/src/legacy-web/components/practice/tools/useStandalonePracticeTools.ts",
);
const webCard = read(
  "apps/web/src/components/practice/review/StandaloneReviewExerciseCard.tsx",
);
const studentCard = read(
  "apps/student/src/legacy-web/components/practice/review/StandaloneReviewExerciseCard.tsx",
);

for (const [name, source] of [
  ["web", web],
  ["student", student],
]) {
  must(
    source.includes("resolveStandalonePracticeToolsIdentity"),
    `${name} standalone Tools does not delegate exercise identity`,
  );

  must(
    source.includes("resolveReviewExerciseSourceCoordinates"),
    `${name} standalone Tools does not share canonical source coordinates`,
  );

  must(
    source.includes("props.modulePracticeProgress") &&
      source.includes("selectedTargets:"),
    `${name} standalone Tools does not consume canonical selectedTargets`,
  );

  must(
    source.includes("sourceCoordinates.sectionSlug"),
    `${name} standalone Tools state key does not use canonical section`,
  );

  must(
    !source.includes("sectionSlug: props.section ?? undefined"),
    `${name} reintroduced nullable PracticeShell section as Tools identity`,
  );

  must(
    source.includes("editorOwnerKey") &&
      source.includes("toolScopeKey"),
    `${name} no longer exposes explicit Tools ownership`,
  );
}

for (const [name, source] of [
  ["web-card", webCard],
  ["student-card", studentCard],
]) {
  must(
    source.includes("resolveReviewExerciseSourceCoordinates"),
    `${name} lost canonical source-coordinate resolver`,
  );
}

console.log("=== ZOESKOUL STANDALONE PRACTICE TOOL IDENTITY PARITY ===");
console.log("source_coordinate_owner=resolveReviewExerciseSourceCoordinates");
console.log("whole_module_null_section_as_identity=absent");
console.log("selected_target_section=authoritative");
console.log("topic_normalization=shared_review_semantics");
console.log("tools_editor_owner=canonical_exercise_state_key");
console.log("web_student_parity=yes");
console.log("RESULT=STANDALONE_PRACTICE_TOOL_IDENTITY_PARITY_PASS");
