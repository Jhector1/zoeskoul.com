import { runPlan } from "./commands/plan.js";
import { runCompileSubject } from "./commands/compile-subject.js";
import { runCompileCourse } from "./commands/compile-course.js";
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
import { runValidateSubject } from "./commands/validate-subject.js";
import { runValidateCourse } from "./commands/validate-course.js";
import { runPublishSubject } from "./commands/publish-subject.js";

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
        throw new Error("Usage: curriculum-cli compile-subject <subjectSlug>");
      }
      await runCompileSubject(arg1, [arg2, ...rest].filter(Boolean) as string[]);      return;
    }

    case "compile-course": {
      if (!arg1 || !arg2) {
        throw new Error(
            "Usage: curriculum-cli compile-course <subjectSlug> <courseSlug> [--live-subject <liveSubjectSlug>]",
        );
      }
      await runCompileCourse(arg1, arg2, rest);
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
        throw new Error("Usage: curriculum-cli publish <subjectSlug>");
      }
      await runPublish(arg1);
      return;
    }

    case "publish-subject": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli publish-subject <subjectSlug>");
      }
      await runPublishSubject(arg1);
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

    case "validate-subject": {
      if (!arg1) {
        throw new Error("Usage: curriculum-cli validate-subject <subjectSlug>");
      }
      await runValidateSubject(arg1);
      return;
    }

    case "validate-course": {
      if (!arg1 || !arg2) {
        throw new Error(
            "Usage: curriculum-cli validate-course <subjectSlug> <courseSlug>",
        );
      }
      await runValidateCourse(arg1, arg2);
      return;
    }

    default: {
      throw new Error(
          "Usage: curriculum-cli <plan|compile-subject|compile-course|compile-topic|critique-topic|critique-topic-draft|critique-subject|critique-subject-draft|review-draft|validate|validate-spec|validate-subject|validate-course|publish|publish-subject|publish-auto> <subjectSlug|blueprintPath> [courseSlug|topicId|options]",      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
