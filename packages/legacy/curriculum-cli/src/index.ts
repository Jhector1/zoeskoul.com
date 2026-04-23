import { runPlan } from "./commands/plan.js";
import { runCompileSubject } from "./commands/compile-subject.js";
import { runCompileTopic } from "./commands/compile-topic.js";
import { runValidateDraft } from "./commands/validate.js";
import { runPublish } from "./commands/publish.js";
import { runPdfToPlan } from "./commands/pdf-to-plan.js";

function requireArg(value: string | undefined, label: string): string {
    if (!value) {
        throw new Error(`Missing required ${label}`);
    }
    return value;
}

async function main() {
    const [, , command, ...args] = process.argv;

    switch (command) {
        case "plan": {
            const blueprintPath = requireArg(args[0], "<blueprintPath>");
            await runPlan(blueprintPath);
            return;
        }

        case "compile-subject": {
            const blueprintPath = requireArg(args[0], "<blueprintPath>");
            await runCompileSubject(blueprintPath);
            return;
        }

        case "compile-topic": {
            const blueprintPath = requireArg(args[0], "<blueprintPath>");
            const topicId = requireArg(args[1], "<topicId>");
            await runCompileTopic(blueprintPath, topicId);
            return;
        }

        case "validate": {
            const draftPath = requireArg(args[0], "<draftPath>");
            await runValidateDraft(draftPath);
            return;
        }

        case "publish": {
            const draftPath = requireArg(args[0], "<draftPath>");
            await runPublish(draftPath);
            return;
        }

        case "pdf-to-plan": {
            await runPdfToPlan(args);
            return;
        }

        default:
            throw new Error(`Unknown command: ${command ?? "(none)"}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});