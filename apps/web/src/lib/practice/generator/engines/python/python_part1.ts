// src/lib/practice/generator/engines/python/python_part1.ts
import type { TopicContext } from "../../generatorTypes";
import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";
import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";

import rawSubjectManifest from "@/lib/subjects/python-for-beginners/subject.manifest.json";
import { TOPIC_MANIFESTS } from "@/lib/subjects/python-for-beginners/topics.generated";
import { makeSubjectGeneratorFromManifest } from "@/lib/practice/generator/engines/json/makeSubjectGeneratorFromManifest";

const subjectManifest = rawSubjectManifest as SubjectManifest;

export function makeGenPythonStatementsPart1(
    ctx: TopicContext,
): SubjectModuleGenerator {
  return makeSubjectGeneratorFromManifest({
    manifest: subjectManifest,
    topicManifests: TOPIC_MANIFESTS,
    ctx,
  });
}
