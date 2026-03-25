import { makeTopicSlug, makeTopicI18n } from "../../meta";

export const TOPIC_ID = "loops_basics" as const;
export const TOPIC_SLUG = makeTopicSlug(TOPIC_ID);
export const K = makeTopicI18n(TOPIC_ID);