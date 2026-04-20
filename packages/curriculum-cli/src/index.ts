#!/usr/bin/env node
import { runPlan } from "./commands/plan.js";
import { runCompileSubject } from "./commands/compile-subject.js";
import { runCompileTopic } from "./commands/compile-topic.js";
import { runValidateDraft } from "./commands/validate.js";
import { runPublish } from "./commands/publish.js";

async function main() {
    const [, , command, arg1, arg2] = process.argv;

    switch (command) {
        case "plan":
            await runPlan(arg1);
            break;
        case "compile-subject":
            await runCompileSubject(arg1);
            break;
        case "compile-topic":
            await runCompileTopic(arg1, arg2);
            break;
        case "validate":
            await runValidateDraft(arg1);
            break;
        case "publish":
            await runPublish(arg1);
            break;
        default:
            console.error(
                "Usage: curriculum-cli <plan|compile-subject|compile-topic|validate|publish> <blueprintPath|subjectSlug> [topicId]",
            );
            process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});