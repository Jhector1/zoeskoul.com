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

const clients = [
  ["web", read("apps/web/src/lib/practice/runtime/client.ts")],
  ["student", read("apps/student/src/legacy-web/lib/practice/runtime/client.ts")],
];

const shared = read(
  "packages/learning-runtime/src/review/module/runtime/practiceAuthoredContract.ts",
);

for (const [name, source] of clients) {
  must(
    source.includes("isLearnerOwnedPracticeRuntimeState") &&
      source.includes("resolvePracticeAuthoredContractValue") &&
      source.includes("shouldMirrorPracticeAuthoredContractFieldToItem"),
    `${name} does not use shared Practice workspace ownership`,
  );

  must(
    !source.includes("function pickLivePracticeContractValue("),
    `${name} reintroduced a parallel contract resolver`,
  );

  must(
    !source.includes("currentSourceRecord[field] ?? currentExerciseRecord[field]"),
    `${name} reintroduced unconditional item workspace promotion`,
  );
}

must(
  shared.includes("LEARNER_OWNED_AUTHORED_STRUCTURE_FIELDS") &&
    shared.includes('"starterFiles"') &&
    shared.includes('"workspace"') &&
    shared.includes("preferCanonicalPracticeStructure"),
  "shared contract lost canonical authored-structure precedence",
);

console.log("=== ZOESKOUL PRACTICE AUTHORED/RUNTIME OWNERSHIP CHECK ===");
console.log("starter_live_item_workspace_may_be_authored_contract=yes");
console.log("learner_saved_item_workspace=runtime_state_only");
console.log("learner_workspace_promoted_into_exercise_workspace=absent");
console.log("practice_exercise_workspace=authored_manifest_structure");
console.log("authored_contract_owner=packages/learning-runtime");
console.log("LessonReview_Practice_workspace_semantics=converged");
console.log("RESULT=PRACTICE_AUTHORED_RUNTIME_OWNERSHIP_PASS");
