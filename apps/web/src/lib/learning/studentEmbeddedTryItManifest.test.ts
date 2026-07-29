import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isEligibleStudentEmbeddedPythonTryIt,
} from "./studentEmbeddedTryItEligibility";

type JsonRecord =
  Record<string, unknown>;

function record(
  value: unknown,
): JsonRecord | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as JsonRecord
    : null;
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

const topicBundleFiles = [
  "python/python-data-functions/modules/module5/topics/creating-and-indexing-lists/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/list-methods-and-mutation/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/looping-through-lists/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/dictionary-basics/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/updating-and-looping-dictionaries/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/tuple-records-and-unpacking/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/nested-data-structures/topic.bundle.json",
  "python/python-data-functions/modules/module5/topics/module-5-workshop-schedule-project/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/decomposition-and-refactoring/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/defining-and-calling-functions/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/docstrings-and-function-contracts/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/parameters-and-return-values/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/print-vs-return/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/scope-and-local-variables/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/module-6-name-badge-package/topic.bundle.json",
  "python/python-data-functions/modules/module6/topics/using-imports-and-helper-files/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/validating-and-cleaning-input/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/writing-text-files/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/working-with-paths/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/reading-text-files/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/module-7-clean-student-records/topic.bundle.json",
  "python/python-data-functions/modules/module7/topics/simple-csv-processing/topic.bundle.json",
  "python/python-data-functions/modules/module8/topics/community-event-registration-cleaner/topic.bundle.json",
  "python/python-v2/modules/module0/topics/values-types-and-literals/topic.bundle.json",
  "python/python-v2/modules/module1/topics/f-strings-and-formatting/topic.bundle.json",
  "python/python-v2/modules/module1/topics/input-and-type-conversion/topic.bundle.json",
  "python/python-v2/modules/module1/topics/string-indexing-and-slicing/topic.bundle.json",
  "python/python-v2/modules/module1/topics/string-methods/topic.bundle.json",
  "python/python-v2/modules/module2/topics/and-or-not/topic.bundle.json",
  "python/python-v2/modules/module2/topics/checking-special-cases-first/topic.bundle.json",
  "python/python-v2/modules/module2/topics/comparisons-and-truth-values/topic.bundle.json",
  "python/python-v2/modules/module2/topics/if-elif-else/topic.bundle.json",
  "python/python-v2/modules/module2/topics/indentation-and-blocks/topic.bundle.json",
  "python/python-v2/modules/module2/topics/module-2-study-checker-project/topic.bundle.json",
  "python/python-v2/modules/module2/topics/truthiness-and-empty-values/topic.bundle.json",
  "python/python-v2/modules/module3/topics/accumulators-and-counters/topic.bundle.json",
  "python/python-v2/modules/module3/topics/break-and-continue/topic.bundle.json",
  "python/python-v2/modules/module3/topics/for-loops-over-text/topic.bundle.json",
  "python/python-v2/modules/module4/topics/mini-gradebook-capstone/topic.bundle.json",
  "python/applied-python-projects/modules/module8/topics/class-files-and-instances/topic.bundle.json",
  "python/applied-python-projects/modules/module10/topics/debugging-imports-and-state/topic.bundle.json",
  "python/applied-python-projects/modules/module10/topics/refactoring-oop-services/topic.bundle.json",
  "python/applied-python-projects/modules/module10/topics/testing-inheritance-and-polymorphism/topic.bundle.json",
  "python/applied-python-projects/modules/module10/topics/testing-object-state/topic.bundle.json",
  "python/applied-python-projects/modules/module11/topics/capstone-domain-model/topic.bundle.json",
  "python/applied-python-projects/modules/module11/topics/capstone-scope-and-architecture/topic.bundle.json",
  "python/applied-python-projects/modules/module11/topics/capstone-storage-and-reports/topic.bundle.json",
  "python/applied-python-projects/modules/module11/topics/capstone-tests-and-polish/topic.bundle.json",
  "python/applied-python-projects/modules/module8/topics/constructors-and-object-state/topic.bundle.json",
  "python/applied-python-projects/modules/module8/topics/encapsulation-and-validation/topic.bundle.json",
  "python/applied-python-projects/modules/module8/topics/methods-and-responsibility/topic.bundle.json",
  "python/applied-python-projects/modules/module8/topics/thinking-in-objects/topic.bundle.json",
  "python/applied-python-projects/modules/module9/topics/abstraction-with-base-interfaces/topic.bundle.json",
  "python/applied-python-projects/modules/module9/topics/inheritance-for-shared-behavior/topic.bundle.json",
  "python/applied-python-projects/modules/module9/topics/overriding-and-specialization/topic.bundle.json",
  "python/applied-python-projects/modules/module9/topics/polymorphic-collections/topic.bundle.json",
] as const;

function loadTopicBundle(
  relativePath: string,
): JsonRecord {
  return JSON.parse(
    readFileSync(
      new URL(
        `../subjects/${relativePath}`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as JsonRecord;
}

function exerciseInventoryKey(
  relativePath: string,
  exerciseKey: string,
): string {
  return `${relativePath}::${exerciseKey}`;
}

function joinedExercises() {
  const joined =
    new Map<
      string,
      {
        ownerCardId: string;
        exercise: unknown;
      }
    >();

  for (const relativePath of topicBundleFiles) {
    const bundle =
      loadTopicBundle(relativePath);
    const exercises =
      Array.isArray(bundle.exercises)
        ? bundle.exercises
        : [];
    const byId =
      new Map<string, unknown>();

    for (const value of exercises) {
      const exercise = record(value);
      const id =
        stringValue(exercise?.id);

      if (id) {
        byId.set(id, value);
      }
    }

    const cards =
      Array.isArray(bundle.cards)
        ? bundle.cards
        : [];

    for (const value of cards) {
      const card = record(value);
      const tryIt =
        record(card?.tryIt);
      const exerciseKey =
        stringValue(
          tryIt?.exerciseKey,
        );

      if (!exerciseKey) continue;

      joined.set(
        exerciseInventoryKey(
          relativePath,
          exerciseKey,
        ),
        {
          ownerCardId:
            stringValue(card?.id),
          exercise:
            byId.get(exerciseKey),
        },
      );
    }
  }

  return joined;
}

const fixedTestEligibleIds = [
  ["python/python-data-functions/modules/module5/topics/creating-and-indexing-lists/topic.bundle.json", "try-creating-and-indexing-lists-sketch0"],
  ["python/python-data-functions/modules/module5/topics/creating-and-indexing-lists/topic.bundle.json", "try-creating-and-indexing-lists-sketch1"],
  ["python/python-data-functions/modules/module5/topics/dictionary-basics/topic.bundle.json", "try-dictionary-basics-sketch0"],
  ["python/python-data-functions/modules/module5/topics/looping-through-lists/topic.bundle.json", "try-looping-through-lists-sketch0"],
  ["python/python-data-functions/modules/module5/topics/module-5-workshop-schedule-project/topic.bundle.json", "try-workshop-schedule-sketch0"],
  ["python/python-data-functions/modules/module5/topics/nested-data-structures/topic.bundle.json", "try-nested-data-structures-sketch0"],
  ["python/python-data-functions/modules/module5/topics/nested-data-structures/topic.bundle.json", "try-nested-data-structures-sketch1"],
  ["python/python-data-functions/modules/module5/topics/tuple-records-and-unpacking/topic.bundle.json", "try-tuple-records-sketch0"],
  ["python/python-data-functions/modules/module5/topics/tuple-records-and-unpacking/topic.bundle.json", "try-tuple-unpacking-sketch1"],
  ["python/python-data-functions/modules/module5/topics/updating-and-looping-dictionaries/topic.bundle.json", "try-updating-and-looping-dictionaries-sketch1"],
] as const;

const semanticEligibleIds = [
  ["python/python-data-functions/modules/module5/topics/creating-and-indexing-lists/topic.bundle.json", "try-creating-and-indexing-lists-sketch2"],
  ["python/python-data-functions/modules/module5/topics/dictionary-basics/topic.bundle.json", "try-dictionary-basics-sketch1"],
  ["python/python-data-functions/modules/module5/topics/dictionary-basics/topic.bundle.json", "try-dictionary-basics-sketch2"],
  ["python/python-data-functions/modules/module5/topics/list-methods-and-mutation/topic.bundle.json", "try-list-methods-and-mutation-sketch0"],
  ["python/python-data-functions/modules/module5/topics/list-methods-and-mutation/topic.bundle.json", "try-list-methods-and-mutation-sketch1"],
  ["python/python-data-functions/modules/module5/topics/list-methods-and-mutation/topic.bundle.json", "try-list-methods-and-mutation-sketch2"],
  ["python/python-data-functions/modules/module5/topics/looping-through-lists/topic.bundle.json", "try-looping-through-lists-sketch1"],
  ["python/python-data-functions/modules/module5/topics/looping-through-lists/topic.bundle.json", "try-looping-through-lists-sketch2"],
  ["python/python-data-functions/modules/module5/topics/nested-data-structures/topic.bundle.json", "try-nested-data-structures-sketch2"],
  ["python/python-data-functions/modules/module5/topics/updating-and-looping-dictionaries/topic.bundle.json", "try-updating-and-looping-dictionaries-sketch0"],
  ["python/python-data-functions/modules/module5/topics/updating-and-looping-dictionaries/topic.bundle.json", "try-updating-and-looping-dictionaries-sketch2"],
  ["python/python-data-functions/modules/module6/topics/decomposition-and-refactoring/topic.bundle.json", "try-decomposition-and-refactoring-sketch0"],
  ["python/python-data-functions/modules/module6/topics/decomposition-and-refactoring/topic.bundle.json", "try-decomposition-and-refactoring-sketch1"],
  ["python/python-data-functions/modules/module6/topics/decomposition-and-refactoring/topic.bundle.json", "try-decomposition-and-refactoring-sketch2"],
  ["python/python-data-functions/modules/module6/topics/defining-and-calling-functions/topic.bundle.json", "try-defining-and-calling-functions-sketch0"],
  ["python/python-data-functions/modules/module6/topics/defining-and-calling-functions/topic.bundle.json", "try-defining-and-calling-functions-sketch1"],
  ["python/python-data-functions/modules/module6/topics/defining-and-calling-functions/topic.bundle.json", "try-defining-and-calling-functions-sketch2"],
  ["python/python-data-functions/modules/module6/topics/docstrings-and-function-contracts/topic.bundle.json", "try-docstrings-and-function-contracts-sketch0"],
  ["python/python-data-functions/modules/module6/topics/docstrings-and-function-contracts/topic.bundle.json", "try-docstrings-and-function-contracts-sketch1"],
  ["python/python-data-functions/modules/module6/topics/docstrings-and-function-contracts/topic.bundle.json", "try-docstrings-and-function-contracts-sketch2"],
  ["python/python-data-functions/modules/module6/topics/parameters-and-return-values/topic.bundle.json", "try-parameters-and-return-values-sketch0"],
  ["python/python-data-functions/modules/module6/topics/parameters-and-return-values/topic.bundle.json", "try-parameters-and-return-values-sketch1"],
  ["python/python-data-functions/modules/module6/topics/print-vs-return/topic.bundle.json", "try-print-vs-return-sketch0"],
  ["python/python-data-functions/modules/module6/topics/print-vs-return/topic.bundle.json", "try-print-vs-return-sketch1"],
  ["python/python-data-functions/modules/module6/topics/print-vs-return/topic.bundle.json", "try-print-vs-return-sketch2"],
  ["python/python-data-functions/modules/module6/topics/scope-and-local-variables/topic.bundle.json", "try-scope-and-local-variables-sketch0"],
  ["python/python-data-functions/modules/module6/topics/scope-and-local-variables/topic.bundle.json", "try-scope-and-local-variables-sketch1"],
  ["python/python-data-functions/modules/module6/topics/scope-and-local-variables/topic.bundle.json", "try-scope-and-local-variables-sketch2"],
  ["python/python-data-functions/modules/module7/topics/validating-and-cleaning-input/topic.bundle.json", "try-validating-and-cleaning-input-sketch0"],
  ["python/python-data-functions/modules/module7/topics/working-with-paths/topic.bundle.json", "try-working-with-paths-sketch0"],
  ["python/python-data-functions/modules/module7/topics/working-with-paths/topic.bundle.json", "try-working-with-paths-sketch1"],
] as const;

const stdinFixedTestEligibleIds = [
  ["python/python-v2/modules/module0/topics/values-types-and-literals/topic.bundle.json", "ci-read-and-print"],
  ["python/python-v2/modules/module1/topics/f-strings-and-formatting/topic.bundle.json", "ci_input_greeting"],
  ["python/python-v2/modules/module1/topics/input-and-type-conversion/topic.bundle.json", "code_echo_name"],
  ["python/python-v2/modules/module1/topics/input-and-type-conversion/topic.bundle.json", "code_add_two_ages"],
  ["python/python-v2/modules/module1/topics/input-and-type-conversion/topic.bundle.json", "code_double_price"],
  ["python/python-v2/modules/module1/topics/string-indexing-and-slicing/topic.bundle.json", "code_first_and_last"],
  ["python/python-v2/modules/module1/topics/string-indexing-and-slicing/topic.bundle.json", "code_middle_slice"],
  ["python/python-v2/modules/module1/topics/string-indexing-and-slicing/topic.bundle.json", "code_prefix_suffix"],
  ["python/python-v2/modules/module1/topics/string-methods/topic.bundle.json", "code-1"],
  ["python/python-v2/modules/module1/topics/string-methods/topic.bundle.json", "code-2"],
  ["python/python-v2/modules/module1/topics/string-methods/topic.bundle.json", "code-3"],
  ["python/python-v2/modules/module2/topics/and-or-not/topic.bundle.json", "code_ticket_check"],
  ["python/python-v2/modules/module2/topics/and-or-not/topic.bundle.json", "code_free_day"],
  ["python/python-v2/modules/module2/topics/and-or-not/topic.bundle.json", "code_not_logged_in"],
  ["python/python-v2/modules/module2/topics/checking-special-cases-first/topic.bundle.json", "code-invalid-before-range"],
  ["python/python-v2/modules/module2/topics/checking-special-cases-first/topic.bundle.json", "code-perfect-before-pass"],
  ["python/python-v2/modules/module2/topics/checking-special-cases-first/topic.bundle.json", "code-empty-yes-other"],
  ["python/python-v2/modules/module2/topics/comparisons-and-truth-values/topic.bundle.json", "ci-age-check"],
  ["python/python-v2/modules/module2/topics/comparisons-and-truth-values/topic.bundle.json", "ci-number-sign"],
  ["python/python-v2/modules/module2/topics/if-elif-else/topic.bundle.json", "code_positive_negative_zero"],
  ["python/python-v2/modules/module2/topics/if-elif-else/topic.bundle.json", "code_pass_fail"],
  ["python/python-v2/modules/module2/topics/if-elif-else/topic.bundle.json", "code_grade_checker"],
  ["python/python-v2/modules/module2/topics/if-elif-else/topic.bundle.json", "code_empty_or_text"],
  ["python/python-v2/modules/module2/topics/indentation-and-blocks/topic.bundle.json", "code-basic-if-output"],
  ["python/python-v2/modules/module2/topics/indentation-and-blocks/topic.bundle.json", "code-two-lines-in-block"],
  ["python/python-v2/modules/module2/topics/indentation-and-blocks/topic.bundle.json", "code-elif-branches"],
  ["python/python-v2/modules/module2/topics/module-2-study-checker-project/topic.bundle.json", "try-module-2-study-checker-project-sketch0"],
  ["python/python-v2/modules/module2/topics/truthiness-and-empty-values/topic.bundle.json", "code-classify-string"],
  ["python/python-v2/modules/module2/topics/truthiness-and-empty-values/topic.bundle.json", "code-classify-number"],
  ["python/python-v2/modules/module2/topics/truthiness-and-empty-values/topic.bundle.json", "code-check-missing-word"],
  ["python/python-v2/modules/module3/topics/accumulators-and-counters/topic.bundle.json", "ex9"],
  ["python/python-v2/modules/module3/topics/accumulators-and-counters/topic.bundle.json", "ex10"],
  ["python/python-v2/modules/module3/topics/accumulators-and-counters/topic.bundle.json", "ex11"],
  ["python/python-v2/modules/module3/topics/break-and-continue/topic.bundle.json", "code-break-stop-at-number"],
  ["python/python-v2/modules/module3/topics/break-and-continue/topic.bundle.json", "code-break-first-negative"],
  ["python/python-v2/modules/module3/topics/for-loops-over-text/topic.bundle.json", "code-1"],
  ["python/python-v2/modules/module3/topics/for-loops-over-text/topic.bundle.json", "code-2"],
  ["python/python-v2/modules/module3/topics/for-loops-over-text/topic.bundle.json", "code-3"],
  ["python/python-v2/modules/module4/topics/mini-gradebook-capstone/topic.bundle.json", "try-mini-gradebook-capstone-sketch0"],
] as const;

const outputFileEligibleIds = [
  ["python/python-data-functions/modules/module7/topics/writing-text-files/topic.bundle.json", "try-writing-text-files-sketch0"],
  ["python/python-data-functions/modules/module7/topics/writing-text-files/topic.bundle.json", "try-writing-text-files-sketch1"],
  ["python/python-data-functions/modules/module7/topics/writing-text-files/topic.bundle.json", "try-writing-text-files-sketch2"],
] as const;

const companionFileEligibleIds = [
  ["python/python-data-functions/modules/module7/topics/reading-text-files/topic.bundle.json", "try-reading-text-files-sketch0"],
  ["python/python-data-functions/modules/module7/topics/reading-text-files/topic.bundle.json", "try-reading-text-files-sketch1"],
  ["python/python-data-functions/modules/module7/topics/reading-text-files/topic.bundle.json", "try-reading-text-files-sketch2"],
  ["python/python-data-functions/modules/module7/topics/working-with-paths/topic.bundle.json", "try-working-with-paths-sketch2"],
  ["python/python-data-functions/modules/module8/topics/community-event-registration-cleaner/topic.bundle.json", "try-community-event-registration-cleaner-sketch0"],
] as const;

const pythonHelperEligibleIds = [
  ["python/applied-python-projects/modules/module10/topics/debugging-imports-and-state/topic.bundle.json", "try-debugging-imports-and-state-sketch0"],
  ["python/applied-python-projects/modules/module10/topics/debugging-imports-and-state/topic.bundle.json", "try-debugging-imports-and-state-sketch1"],
  ["python/applied-python-projects/modules/module10/topics/debugging-imports-and-state/topic.bundle.json", "try-debugging-imports-and-state-sketch2"],
  ["python/applied-python-projects/modules/module10/topics/refactoring-oop-services/topic.bundle.json", "try-refactoring-oop-services-sketch0"],
  ["python/applied-python-projects/modules/module10/topics/refactoring-oop-services/topic.bundle.json", "try-refactoring-oop-services-sketch1"],
  ["python/applied-python-projects/modules/module10/topics/refactoring-oop-services/topic.bundle.json", "try-refactoring-oop-services-sketch2"],
  ["python/applied-python-projects/modules/module10/topics/testing-inheritance-and-polymorphism/topic.bundle.json", "try-testing-inheritance-and-polymorphism-sketch2"],
  ["python/applied-python-projects/modules/module11/topics/capstone-domain-model/topic.bundle.json", "try-capstone-domain-model-sketch0"],
  ["python/applied-python-projects/modules/module8/topics/class-files-and-instances/topic.bundle.json", "try-class-files-and-instances-sketch0"],
  ["python/applied-python-projects/modules/module8/topics/class-files-and-instances/topic.bundle.json", "try-class-files-and-instances-sketch1"],
  ["python/applied-python-projects/modules/module8/topics/class-files-and-instances/topic.bundle.json", "try-class-files-and-instances-sketch2"],
  ["python/applied-python-projects/modules/module8/topics/constructors-and-object-state/topic.bundle.json", "try-constructors-and-object-state-sketch0"],
  ["python/applied-python-projects/modules/module8/topics/constructors-and-object-state/topic.bundle.json", "try-constructors-and-object-state-sketch1"],
  ["python/applied-python-projects/modules/module8/topics/constructors-and-object-state/topic.bundle.json", "try-constructors-and-object-state-sketch2"],
  ["python/applied-python-projects/modules/module8/topics/encapsulation-and-validation/topic.bundle.json", "try-encapsulation-and-validation-sketch0"],
  ["python/applied-python-projects/modules/module8/topics/encapsulation-and-validation/topic.bundle.json", "try-encapsulation-and-validation-sketch1"],
  ["python/applied-python-projects/modules/module8/topics/encapsulation-and-validation/topic.bundle.json", "try-encapsulation-and-validation-sketch2"],
  ["python/applied-python-projects/modules/module8/topics/methods-and-responsibility/topic.bundle.json", "try-methods-and-responsibility-sketch0"],
  ["python/applied-python-projects/modules/module8/topics/methods-and-responsibility/topic.bundle.json", "try-methods-and-responsibility-sketch1"],
  ["python/applied-python-projects/modules/module8/topics/methods-and-responsibility/topic.bundle.json", "try-methods-and-responsibility-sketch2"],
  ["python/applied-python-projects/modules/module8/topics/thinking-in-objects/topic.bundle.json", "try-thinking-in-objects-sketch0"],
  ["python/applied-python-projects/modules/module8/topics/thinking-in-objects/topic.bundle.json", "try-thinking-in-objects-sketch1"],
  ["python/applied-python-projects/modules/module8/topics/thinking-in-objects/topic.bundle.json", "try-thinking-in-objects-sketch2"],
  ["python/applied-python-projects/modules/module9/topics/inheritance-for-shared-behavior/topic.bundle.json", "try-inheritance-for-shared-behavior-sketch0"],
] as const;

const pythonHelperFallbackIds = [
  ["python/applied-python-projects/modules/module10/topics/testing-inheritance-and-polymorphism/topic.bundle.json", "try-testing-inheritance-and-polymorphism-sketch0"],
  ["python/applied-python-projects/modules/module10/topics/testing-inheritance-and-polymorphism/topic.bundle.json", "try-testing-inheritance-and-polymorphism-sketch1"],
  ["python/applied-python-projects/modules/module10/topics/testing-object-state/topic.bundle.json", "try-testing-object-state-sketch0"],
  ["python/applied-python-projects/modules/module10/topics/testing-object-state/topic.bundle.json", "try-testing-object-state-sketch1"],
  ["python/applied-python-projects/modules/module10/topics/testing-object-state/topic.bundle.json", "try-testing-object-state-sketch2"],
  ["python/applied-python-projects/modules/module11/topics/capstone-scope-and-architecture/topic.bundle.json", "try-capstone-scope-and-architecture-sketch0"],
  ["python/applied-python-projects/modules/module11/topics/capstone-storage-and-reports/topic.bundle.json", "try-capstone-storage-and-reports-sketch0"],
  ["python/applied-python-projects/modules/module11/topics/capstone-tests-and-polish/topic.bundle.json", "try-capstone-tests-and-polish-sketch0"],
  ["python/applied-python-projects/modules/module9/topics/abstraction-with-base-interfaces/topic.bundle.json", "try-abstraction-with-base-interfaces-sketch0"],
  ["python/applied-python-projects/modules/module9/topics/abstraction-with-base-interfaces/topic.bundle.json", "try-abstraction-with-base-interfaces-sketch1"],
  ["python/applied-python-projects/modules/module9/topics/abstraction-with-base-interfaces/topic.bundle.json", "try-abstraction-with-base-interfaces-sketch2"],
  ["python/applied-python-projects/modules/module9/topics/inheritance-for-shared-behavior/topic.bundle.json", "try-inheritance-for-shared-behavior-sketch1"],
  ["python/applied-python-projects/modules/module9/topics/inheritance-for-shared-behavior/topic.bundle.json", "try-inheritance-for-shared-behavior-sketch2"],
  ["python/applied-python-projects/modules/module9/topics/overriding-and-specialization/topic.bundle.json", "try-overriding-and-specialization-sketch0"],
  ["python/applied-python-projects/modules/module9/topics/overriding-and-specialization/topic.bundle.json", "try-overriding-and-specialization-sketch1"],
  ["python/applied-python-projects/modules/module9/topics/overriding-and-specialization/topic.bundle.json", "try-overriding-and-specialization-sketch2"],
  ["python/applied-python-projects/modules/module9/topics/polymorphic-collections/topic.bundle.json", "try-polymorphic-collections-sketch0"],
  ["python/applied-python-projects/modules/module9/topics/polymorphic-collections/topic.bundle.json", "try-polymorphic-collections-sketch1"],
  ["python/applied-python-projects/modules/module9/topics/polymorphic-collections/topic.bundle.json", "try-polymorphic-collections-sketch2"],
] as const;

const complexFallbackIds = [
  ["python/python-data-functions/modules/module6/topics/module-6-name-badge-package/topic.bundle.json", "try-module-6-name-badge-package-sketch0"],
  ["python/python-data-functions/modules/module6/topics/using-imports-and-helper-files/topic.bundle.json", "try-using-imports-and-helper-files-sketch0"],
  ["python/python-data-functions/modules/module6/topics/using-imports-and-helper-files/topic.bundle.json", "try-using-imports-and-helper-files-sketch1"],
  ["python/python-data-functions/modules/module6/topics/using-imports-and-helper-files/topic.bundle.json", "try-using-imports-and-helper-files-sketch2"],
  ["python/python-data-functions/modules/module7/topics/module-7-clean-student-records/topic.bundle.json", "try-module-7-clean-student-records-sketch0"],
  ["python/python-data-functions/modules/module7/topics/simple-csv-processing/topic.bundle.json", "try-simple-csv-processing-sketch0"],
  ["python/python-data-functions/modules/module7/topics/simple-csv-processing/topic.bundle.json", "try-simple-csv-processing-sketch1"],
  ["python/python-data-functions/modules/module7/topics/simple-csv-processing/topic.bundle.json", "try-simple-csv-processing-sketch2"],
] as const;

function fixedTestStdinValues(
  exerciseValue: unknown,
): string[] {
  const exercise =
    record(exerciseValue);
  const recipe =
    record(exercise?.recipe);
  const tests =
    Array.isArray(recipe?.tests)
      ? recipe.tests
      : [];

  return tests.flatMap((value) => {
    const test = record(value);
    return typeof test?.stdin === "string"
      ? [test.stdin]
      : [];
  });
}

function starterFilePaths(
  exerciseValue: unknown,
): string[] {
  const exercise =
    record(exerciseValue);

  return Array.isArray(
    exercise?.starterFiles,
  )
    ? exercise.starterFiles.flatMap(
        (value) => {
          const file = record(value);
          const path =
            stringValue(file?.path);

          return path
            ? [path]
            : [];
        },
      )
    : [];
}

function fixedTestFiles(
  exerciseValue: unknown,
): JsonRecord[] {
  const exercise =
    record(exerciseValue);
  const recipe =
    record(exercise?.recipe);
  const tests =
    Array.isArray(recipe?.tests)
      ? recipe.tests
      : [];

  return tests.flatMap((value) => {
    const test = record(value);

    return Array.isArray(test?.files)
      ? test.files.flatMap(
          (fileValue) => {
            const file =
              record(fileValue);
            return file
              ? [file]
              : [];
          },
        )
      : [];
  });
}

function semanticChecks(
  exerciseValue: unknown,
): unknown[] {
  const exercise =
    record(exerciseValue);
  const recipe =
    record(exercise?.recipe);

  if (
    Array.isArray(
      recipe?.semanticChecks,
    )
  ) {
    return recipe.semanticChecks;
  }

  return Array.isArray(
    exercise?.semanticChecks,
  )
    ? exercise.semanticChecks
    : [];
}

describe(
  "published embedded Python Try It eligibility",
  () => {
    const joined = joinedExercises();

    it.each(
      fixedTestEligibleIds,
    )(
      "keeps %s / %s eligible for the direct Vite editor",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );

    it("locks the audited semantic candidate inventory", () => {
      expect(
        semanticEligibleIds,
      ).toHaveLength(31);
    });

    it.each(
      semanticEligibleIds,
    )(
      "keeps semantic exercise %s / %s eligible for the direct Vite editor",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(
          semanticChecks(
            pair?.exercise,
          ).length,
        ).toBeGreaterThan(0);
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );


    it("locks the audited stdin candidate inventory", () => {
      expect(
        stdinFixedTestEligibleIds,
      ).toHaveLength(39);
    });

    it.each(
      stdinFixedTestEligibleIds,
    )(
      "keeps stdin exercise %s / %s eligible without exposing its tests",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );
        const stdinValues =
          fixedTestStdinValues(
            pair?.exercise,
          );

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(
          stdinValues.length,
        ).toBeGreaterThan(0);
        expect(
          stdinValues.every(
            (value) =>
              value.length > 0,
          ),
        ).toBe(true);
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );

    it("locks the audited writable-output-file inventory", () => {
      expect(
        outputFileEligibleIds,
      ).toHaveLength(3);
    });

    it.each(
      outputFileEligibleIds,
    )(
      "keeps writable-output exercise %s / %s eligible without exposing its runtime file",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );
        const files =
          fixedTestFiles(
            pair?.exercise,
          );

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(files.length).toBe(1);
        expect(files[0]).toMatchObject({
          content: "",
          readOnly: false,
        });
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );

    it("locks the learner-visible companion-file inventory", () => {
      expect(
        companionFileEligibleIds,
      ).toHaveLength(5);
    });

    it.each(
      companionFileEligibleIds,
    )(
      "keeps companion-file exercise %s / %s in the direct Vite editor",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );
        const paths =
          starterFilePaths(
            pair?.exercise,
          );

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(paths).toHaveLength(2);
        expect(paths).toContain(
          "main.py",
        );
        expect(
          paths.some(
            (path) =>
              path.endsWith(".txt") ||
              path.endsWith(".csv"),
          ),
        ).toBe(true);
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );

    it("locks the strict two-file Python-helper inventory", () => {
      expect(
        pythonHelperEligibleIds,
      ).toHaveLength(24);
    });

    it.each(
      pythonHelperEligibleIds,
    )(
      "keeps Python-helper exercise %s / %s in the direct Vite editor",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );
        const paths =
          starterFilePaths(
            pair?.exercise,
          );
        const helperPaths =
          paths.filter(
            (path) =>
              path !== "main.py",
          );

        expect(pair).toBeDefined();
        expect(
          pair?.ownerCardId,
        ).toMatch(/^sketch\d+$/);
        expect(paths).toHaveLength(2);
        expect(paths).toContain(
          "main.py",
        );
        expect(helperPaths).toHaveLength(1);
        expect(
          helperPaths[0],
        ).toMatch(
          /^[^/]+\/.+\.py$/,
        );
        expect(
          semanticChecks(
            pair?.exercise,
          ).length,
        ).toBeGreaterThan(0);
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(true);
      },
    );

    it("locks larger and alternate-entry Python workspaces to fallback", () => {
      expect(
        pythonHelperFallbackIds,
      ).toHaveLength(19);
    });

    it.each(
      pythonHelperFallbackIds,
    )(
      "keeps broader Python workspace %s / %s on the full workspace fallback",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );

        expect(pair).toBeDefined();
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(false);
      },
    );

    it.each(
      complexFallbackIds,
    )(
      "keeps complex exercise %s / %s on the full workspace fallback",
      (relativePath, exerciseKey) => {
        const pair =
          joined.get(
            exerciseInventoryKey(
              relativePath,
              exerciseKey,
            ),
          );

        expect(pair).toBeDefined();
        expect(
          isEligibleStudentEmbeddedPythonTryIt(
            pair?.exercise,
          ),
        ).toBe(false);
      },
    );
  },
);
