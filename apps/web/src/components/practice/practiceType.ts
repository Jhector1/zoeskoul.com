import {CodeLanguage, TopicSlug} from "@/lib/practice/types";
import {InteractiveLanguage} from "@zoeskoul/code-contracts";

export type TopicValue = TopicSlug | "all";


export type { QItem, PracticeHelpEntry, PracticeHelpState, MissedItem } from "@/lib/practice/uiTypes";
export function isInteractiveLanguage(language: CodeLanguage): language is InteractiveLanguage {
    return language !== "sql";
}