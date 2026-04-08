import { PracticePurpose } from "@prisma/client";

import type { TopicContext } from "../../generatorTypes";
import {
    makeSubjectModuleGenerator,
    type SubjectModuleGenerator,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";

/* -------------------------------- sql helpers -------------------------------- */

export function sqlFence(sql: string) {
    return String.raw`~~~sql
${sql.trim()}
~~~`;
}

/* -------------------------------- module wrapper -------------------------------- */

export function makeSqlModuleGenerator(args: {
    engineName: string;
    ctx: TopicContext;
    topics: readonly TopicBundle[];
    defaultPurpose?: PracticePurpose;
    enablePurpose?: boolean;
}): SubjectModuleGenerator {
    return makeSubjectModuleGenerator(args);
}

/* -------------------------------- re-exports -------------------------------- */

export type { SubjectModuleGenerator, TopicBundle };