// src/lib/practice/generator/engines/sql/sql_for_beginners.ts
import type { TopicContext } from "../../generatorTypes";
import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";
import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";

import rawSubjectManifest from "@/lib/subjects/sql/subject.manifest.json";
import { TOPIC_MANIFESTS } from "@/lib/subjects/sql/topics.generated";
import { makeSubjectGeneratorFromManifest } from "@/lib/practice/generator/engines/json/makeSubjectGeneratorFromManifest";

const subjectManifest = rawSubjectManifest as SubjectManifest;

export function makeGenSqlStatementsSqlForBeginners(
    ctx: TopicContext,
): SubjectModuleGenerator {
    return makeSubjectGeneratorFromManifest({
        manifest: subjectManifest,
        topicManifests: TOPIC_MANIFESTS,
        ctx,
    });
}