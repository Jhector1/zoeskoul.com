import {
  Runner,
} from "@openai/agents";

import {
  LearnerBrowser,
} from "../browser/learnerBrowser.js";
import {
  StudentRunReportSchema,
  type StudentRunReport,
} from "./report.js";
import {
  createStudentAgent,
} from "./studentAgent.js";
import {
  createStudentBrowserTools,
} from "./tools.js";

export type RunStudentAgentOptions = {
  startUrl: string;
  scope?: string;
  headed?: boolean;
  storageStatePath?: string;
  additionalAllowedOrigins?: readonly string[];
  maxTurns?: number;
  model?: string;
};

export async function runStudentAgent(
  options: RunStudentAgentOptions,
): Promise<StudentRunReport> {
  const browser =
    await LearnerBrowser.launch({
      startUrl: options.startUrl,
      headed: options.headed,
      storageStatePath:
        options.storageStatePath,
      additionalAllowedOrigins:
        options.additionalAllowedOrigins,
    });

  try {
    const tools =
      createStudentBrowserTools(
        browser,
      );

    const agent =
      createStudentAgent(
        tools,
        options.model,
      );

    const runner =
      new Runner({
        workflowName:
          "ZoeSkoul Student Curriculum Review",
        traceIncludeSensitiveData: false,
        traceMetadata: {
          agentRole: "student",
          startOrigin:
            new URL(
              options.startUrl,
            ).origin,
        },
      });

    const scope =
      options.scope?.trim() ||
      "Take the learner flow starting at this URL and continue until that visible course/module flow is complete.";

    const result =
      await runner.run(
        agent,
        [
          "Take this ZoeSkoul curriculum exactly as a learner would.",
          `Start URL: ${options.startUrl}`,
          `Scope: ${scope}`,
          "",
          "Use the Student UI tools immediately. Do not answer from memory.",
          "The course named in Scope is the exact target. Do not substitute a different enrolled course.",
          "If the target is not already enrolled or available in My Learning, use the learner-visible Catalogs flow to find that exact course and enroll/start it before entering modules.",
          "Seeing only unrelated enrolled courses in My Learning is not a blocker; go to Catalogs and find the requested course.",
        ].join("\n"),
        {
          maxTurns:
            options.maxTurns ?? 200,
          toolExecution: {
            maxFunctionToolConcurrency: 1,
          },
        },
      );

    const modelReport =
      StudentRunReportSchema.parse(
        result.finalOutput,
      );

    return StudentRunReportSchema.parse({
      ...modelReport,
      startUrl: options.startUrl,
      endUrl: browser.currentUrl,
      browserEvidence:
        browser.getEvidence(),
    });
  } finally {
    await browser.close();
  }
}
