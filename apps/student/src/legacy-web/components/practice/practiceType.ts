import {WorkspaceLanguage, TopicSlug} from "@zoeskoul/learner-workspace/contracts/practiceTypes";
import {InteractiveLanguage} from "@zoeskoul/code-contracts";

export type TopicValue = TopicSlug | "all";


export type { QItem, PracticeHelpEntry, PracticeHelpState, MissedItem } from "@/lib/practice/uiTypes";
export function isInteractiveLanguage(language: WorkspaceLanguage): language is InteractiveLanguage {
    return (
        language !== "sql" &&
        language !== "bash" &&
        language !== "web"
    );
}
