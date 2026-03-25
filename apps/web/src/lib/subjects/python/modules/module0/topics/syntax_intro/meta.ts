import { makeTopicSlug, makeTopicI18n } from "../../meta";

export const TOPIC_ID = "syntax_intro" as const;
export const TOPIC_SLUG = makeTopicSlug(TOPIC_ID);
export const K = makeTopicI18n(TOPIC_ID);