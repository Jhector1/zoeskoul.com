import { runPlan } from "./commands/plan.js";
import { runCompileSubject } from "./commands/compile-subject.js";
import { runCompileTopic } from "./commands/compile-topic.js";
import { runCritiqueTopic } from "./commands/critique-topic.js";
import { runCritiqueTopicDraft } from "./commands/critique-topic-draft.js";
import { runCritiqueSubject } from "./commands/critique-subject.js";
import { runCritiqueSubjectDraft } from "./commands/critique-subject-draft.js";
import { runReviewDraft } from "./commands/review-draft.js";
import { runValidateDraft } from "./commands/validate.js";
import { runPublish } from "./commands/publish.js";
import { runPublishAuto } from "./commands/publish-auto.js";
import {runValidateSpec} from "./commands/validate-spec.js";

async function main() {
  const [, , command, arg1, arg2, ...rest] = process.argv;

  switch (command) {
    case "plan": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli plan <blueprintPath>");
      }
      await runPlan(arg1);
      return;
    }

    case "compile-subject": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli compile-subject <blueprintPath>");
      }
      await runCompileSubject(arg1);
      return;
    }

    case "compile-topic": {
      if (!arg1 || !arg2) {
        throw new Error(
            "Usage: curriculum-cli compile-topic <blueprintPath> <topicId>",
        );
      }
      await runCompileTopic(arg1, arg2);
      return;
    }

    case "critique-topic": {
      if (!arg1 || !arg2) {
        throw new Error(
            "Usage: curriculum-cli critique-topic <blueprintPath> <topicId>",
        );
      }
      await runCritiqueTopic(arg1, arg2);
      return;
    }

    case "critique-topic-draft": {
      if (!arg1 || !arg2) {
        throw new Error(
            "Usage: curriculum-cli critique-topic-draft <blueprintPath> <topicId>",
        );
      }
      await runCritiqueTopicDraft(arg1, arg2);
      return;
    }

    case "critique-subject": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli critique-subject <blueprintPath>");
      }
      await runCritiqueSubject(arg1);
      return;
    }

    case "critique-subject-draft": {
      if (!arg1) {
        throw new Error(
            "Usage: curriculum-cli critique-subject-draft <blueprintPath>",
        );
      }
      await runCritiqueSubjectDraft(arg1);
      return;
    }

    case "review-draft": {
      if (!arg1) {
        throw new Error(
            "Usage: curriculum-cli review-draft <blueprintPath> [--module <moduleSlug|moduleIndex>] [--topic <topicId>] [--fix] [--fail-on-errors]",
        );
      }
      await runReviewDraft(arg1, [arg2, ...rest].filter(Boolean) as string[]);
      return;
    }

    case "validate": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli validate <subjectSlug>");
      }
      await runValidateDraft(arg1);
      return;
    }

    case "publish": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli publish <blueprintPath>");
      }
      await runPublish(arg1);
      return;
    }

    case "publish-auto": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli publish-auto <blueprintPath>");
      }
      await runPublishAuto(arg1);
      return;
    }
    case "validate-spec": {
      if (!arg1) {
        throw new Error(
            "Usage: curriculum-cli validate-spec <subjectSlug|blueprintPath>",
        );
      }
      await runValidateSpec(arg1);
      return;
    }

    default: {
      throw new Error(
          "Usage: curriculum-cli <plan|compile-subject|compile-topic|critique-topic|critique-topic-draft|critique-subject|critique-subject-draft|review-draft|validate|validate-spec|publish|publish-auto> <blueprintPath|subjectSlug> [topicId|options]",      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
