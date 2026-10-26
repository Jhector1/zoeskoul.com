import type { BuildProjectDetailRecord } from "@zoeskoul/build-application";

/** Safe client-facing summary; the canonical workspace stays on the authorized server. */
export function presentZoeAssistantProjectContext(project: BuildProjectDetailRecord) {
  return {
    buildProjectId: project.buildProjectId,
    title: project.title,
    description: project.description,
    stackId: project.stackId,
    status: project.status,
    language: project.language,
    sourceVersion: project.sourceVersion,
    entryPath: project.entryPath,
    activePath: project.activePath,
  };
}
