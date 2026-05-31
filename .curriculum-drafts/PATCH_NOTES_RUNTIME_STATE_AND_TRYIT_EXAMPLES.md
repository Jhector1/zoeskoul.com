# Runtime state checks and try-it expected examples

Applied fixes in the subject topic bundles:

- Every try-it-yourself code exercise now has `showExpectedExample: true`.
- Deterministic stateful fixed-test exercises now include `recipe.semanticChecks` using `variable_equals`, so simply printing the expected answer is not enough when the exercise requires named state such as a list, dictionary, counter, total, path, or records collection.
- File-writing exercises now include workspace required-file expectations, so learners must create the required file instead of only printing the expected contents.
- Provided solutions that write into `output/` now create the folder before writing.

Final subject-bundle metrics:

```json
{
  "subject_topic_bundles": 23,
  "subject_code_inputs": 154,
  "subject_try_code_inputs_showing_expected": 79,
  "subject_fixed_test_exercises_with_runtime_state_checks": 29,
  "subject_runtime_state_checks": 30,
  "subject_exercises_with_workspace_expectations": 33
}
```
