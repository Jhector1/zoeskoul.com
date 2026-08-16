import {
  tool,
} from "@openai/agents";
import {
  z,
} from "zod";

import type {
  LearnerBrowser,
} from "../browser/learnerBrowser.js";

const emptyParameters =
  z.object({});

export function createStudentBrowserTools(
  browser: LearnerBrowser,
) {
  const inspectZoeSkoulStudentState =
    tool({
      name: "inspect_zoeskoul_student_state",
      description:
        "Inspect learner-visible ZoeSkoul state: current surface, headings, ReviewModule busy state, attempts, Check/Next/Finish/Reveal state, visible Monaco text, visible Run action, feedback, bottom navigation, and completion signals. It exposes no source files, answers, hidden tests, grader data, network payloads, or devtools information.",
      parameters: emptyParameters,
      async execute() {
        return browser.inspectZoeSkoulState();
      },
    });

  const observeStudentUi = tool({
    name: "observe_student_ui",
    description:
      "Read learner-visible page text and visible interactive controls. Each visible control receives a temporary id. Use this for Start, Continue, contextual Next/Previous, quiz choices, Topics, course cards, modules, and other learner controls.",
    parameters: emptyParameters,
    async execute() {
      return browser.observe();
    },
  });

  const clickStudentUi = tool({
    name: "click_student_ui",
    description:
      "Click one visible learner UI control by the temporary id returned by observe_student_ui. Observe again after UI changes instead of reusing stale ids. Inside an active /learn flow, never use the header Modules control as a forward-progress shortcut. Prefer the current learner-flow CTA such as Finish practice, Finish quiz, Finish, Next, Next topic, Quiz, Mark as read, or Continue.",
    parameters: z.object({
      id: z.string().min(1),
    }),
    async execute({ id }) {
      await browser.click(id);
      return browser.inspectZoeSkoulState();
    },
  });

  const fillStudentUi = tool({
    name: "fill_student_ui",
    description:
      "Replace a normal visible learner input or textarea. Do not use this for Monaco; use replace_primary_code_editor.",
    parameters: z.object({
      id: z.string().min(1),
      text: z.string(),
    }),
    async execute({ id, text }) {
      await browser.fill(id, text);
      return { ok: true };
    },
  });

  const openPrimaryCodeEditor =
    tool({
      name: "open_primary_code_editor",
      description:
        "Open the learner-visible ZoeSkoul code workspace when a code exercise is active. This uses normal Tools/Code/Editor controls only and waits until the visible Monaco editor is interactive. Use this when a code exercise is visible but monacoVisible is false.",
      parameters: emptyParameters,
      async execute() {
        return browser.ensurePrimaryEditorVisible();
      },
    });

  const continueToNextModule =
    tool({
      name: "continue_to_next_module",
      description:
        "Continue from a genuinely completed ZoeSkoul module into the next module using learner-visible controls only. Do not call this while an in-module Finish practice, Finish quiz, Finish, Next, Next topic, Quiz, Mark as read, or Continue action remains. Prefer the visible module-completion dialog when it offers Next module/Continue; otherwise use the normal exact Next module control. Never use the header Modules drawer as a substitute. Use only when the requested review scope includes another module.",
      parameters: emptyParameters,
      async execute() {
        return browser.continueToNextModule();
      },
    });

  const replacePrimaryCodeEditor =
    tool({
      name: "replace_primary_code_editor",
      description:
        "Replace text in the currently visible learner Monaco editor using its normal keyboard input path. Decide the answer yourself from learner-visible teaching first.",
      parameters: z.object({
        text: z.string(),
      }),
      async execute({ text }) {
        await browser.replacePrimaryEditorText(
          text,
        );
        return browser.inspectZoeSkoulState();
      },
    });

  const performZoeSkoulAction =
    tool({
      name: "perform_zoeskoul_action",
      description:
        "Perform one stable learner action exposed by ZoeSkoul: check_answer, reveal, practice_next, finish, run, or modules. These click the actual learner controls and then wait for client-side ReviewModule state to settle. Use observe_student_ui/click_student_ui for normal contextual Next/Previous and quiz choices.",
      parameters: z.object({
        action: z.enum([
          "check_answer",
          "reveal",
          "practice_next",
          "finish",
          "run",
          "modules",
        ]),
      }),
      async execute({ action }) {
        await browser.performSemanticAction(
          action,
        );
        return browser.inspectZoeSkoulState();
      },
    });

  const typeStudentUi = tool({
    name: "type_student_ui",
    description:
      "Type at the currently focused learner control.",
    parameters: z.object({
      text: z.string(),
    }),
    async execute({ text }) {
      await browser.typeText(text);
      return { ok: true };
    },
  });

  const pressStudentUi = tool({
    name: "press_student_ui",
    description:
      "Press a learner keyboard key or shortcut.",
    parameters: z.object({
      key: z.string().min(1),
    }),
    async execute({ key }) {
      await browser.press(key);
      return { ok: true };
    },
  });

  const scrollStudentUi = tool({
    name: "scroll_student_ui",
    description:
      "Scroll the learner page up or down.",
    parameters: z.object({
      direction: z.enum([
        "up",
        "down",
      ]),
      amount: z
        .number()
        .int()
        .min(100)
        .max(2400)
        .default(700),
    }),
    async execute({
      direction,
      amount,
    }) {
      await browser.scroll(
        direction,
        amount,
      );
      return { ok: true };
    },
  });

  const settleZoeSkoulStudentUi =
    tool({
      name: "settle_zoeskoul_student_ui",
      description:
        "Wait until ZoeSkoul's client-side ReviewModule state stabilizes after Run, Check, practice Next/Finish, generic Next/Previous, pushState navigation, save synchronization, or auto-advance. Do not assume a full page load happened.",
      parameters: z.object({
        timeoutMs: z
          .number()
          .int()
          .min(300)
          .max(15_000)
          .default(5000),
      }),
      async execute({
        timeoutMs,
      }) {
        return browser.waitForZoeSkoulStateToSettle(
          timeoutMs,
        );
      },
    });

  const waitStudentUi = tool({
    name: "wait_student_ui",
    description:
      "Wait briefly when a learner would reasonably wait for output, execution, or feedback.",
    parameters: z.object({
      milliseconds: z
        .number()
        .int()
        .min(50)
        .max(10_000),
    }),
    async execute({
      milliseconds,
    }) {
      await browser.wait(milliseconds);
      return browser.inspectZoeSkoulState();
    },
  });

  return [
    inspectZoeSkoulStudentState,
    observeStudentUi,
    clickStudentUi,
    fillStudentUi,
    openPrimaryCodeEditor,
    continueToNextModule,
    replacePrimaryCodeEditor,
    performZoeSkoulAction,
    typeStudentUi,
    pressStudentUi,
    scrollStudentUi,
    settleZoeSkoulStudentUi,
    waitStudentUi,
  ];
}
