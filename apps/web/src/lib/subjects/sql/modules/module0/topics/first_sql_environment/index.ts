
import manifest from "./topic.bundle.json";
import { defineJsonTopicBundle } from "@/lib/subjects/_core/defineJsonTopicBundle";

export const FIRST_SQL_ENVIRONMENT_TOPIC = defineJsonTopicBundle(manifest);