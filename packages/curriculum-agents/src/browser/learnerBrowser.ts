import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  LearnerActionLog,
  type LearnerBrowserEvidence,
} from "./actionLog.js";
import {
  assertAllowedNavigationUrl,
  createOriginPolicy,
  type OriginPolicy,
} from "./originPolicy.js";
import {
  shouldRejectGenericModulesProgressionClick,
} from "./learnerProgressionGuard.js";
import {
  classifyZoeSkoulSurface,
  type ZoeSkoulSurface,
} from "./zoeskoulSurface.js";

export type LearnerBrowserOptions = {
  startUrl: string;
  headed?: boolean;
  storageStatePath?: string;
  additionalAllowedOrigins?: readonly string[];
  viewport?: {
    width: number;
    height: number;
  };
};

export type LearnerInteractiveElement = {
  id: string;
  tag: string;
  role: string | null;
  text: string;
  ariaLabel: string | null;
  placeholder: string | null;
  inputType: string | null;
  value: string | null;
  disabled: boolean;
  testId: string | null;
};

export type LearnerPageSnapshot = {
  url: string;
  title: string;
  visibleText: string;
  elements: LearnerInteractiveElement[];
};

export type ZoeSkoulLearnerState = {
  url: string;
  surface: ZoeSkoulSurface;
  title: string;
  headings: string[];
  busy: boolean;
  navigationStatus: string | null;
  primaryPracticeAction: {
    testId: string;
    text: string;
    disabled: boolean;
  } | null;
  revealAvailable: boolean;
  attemptsText: string | null;
  monacoVisible: boolean;
  monacoMountedCount: number;
  monacoVisibleCount: number;
  visibleEditorText: string | null;
  runAction: {
    text: string;
    disabled: boolean;
  } | null;
  feedback: string[];
  bottomActions: Array<{
    text: string;
    disabled: boolean;
  }>;
  moduleCompleteSignal: boolean;
};

export type ZoeSkoulSemanticAction =
  | "check_answer"
  | "reveal"
  | "practice_next"
  | "finish"
  | "run"
  | "modules";

const MAX_VISIBLE_TEXT = 40_000;
const MAX_ELEMENT_TEXT = 300;
const MAX_EDITOR_TEXT = 8_000;
const AGENT_ID_ATTRIBUTE =
  "data-zoeskoul-student-agent-id";

function truncate(
  value: string,
  max: number,
): string {
  return value.length <= max
    ? value
    : `${value.slice(0, max)}\n...[truncated]`;
}

function normalizeText(
  value: string,
): string {
  return value.replace(/\s+/g, " ").trim();
}

export class LearnerBrowser {
  readonly policy: OriginPolicy;

  #browser: Browser;
  #context: BrowserContext;
  #page: Page;
  #log = new LearnerActionLog();

  private constructor(
    browser: Browser,
    context: BrowserContext,
    page: Page,
    policy: OriginPolicy,
  ) {
    this.#browser = browser;
    this.#context = context;
    this.#page = page;
    this.policy = policy;
  }

  static async launch(
    options: LearnerBrowserOptions,
  ): Promise<LearnerBrowser> {
    const policy = createOriginPolicy(
      options.startUrl,
      options.additionalAllowedOrigins ?? [],
    );

    const browser = await chromium.launch({
      headless: !(options.headed ?? false),
      chromiumSandbox: true,
      env: {},
      args: [
        "--disable-extensions",
        "--disable-file-system",
      ],
    });

    const context = await browser.newContext({
      viewport:
        options.viewport ?? {
          width: 1440,
          height: 900,
        },
      storageState: options.storageStatePath,
    });

    // tsx/esbuild can preserve function names by emitting calls to its
    // internal __name helper inside callbacks passed to page.evaluate().
    // Playwright serializes the callback into the browser, where the Node-side
    // helper does not exist. Install only that tiny helper in the isolated
    // agent browser context before any ZoeSkoul document is created.
    //
    // This does not expose curriculum/runtime internals to the model; it only
    // makes our learner-visible DOM inspection callbacks executable.
    await context.addInitScript(`
      Object.defineProperty(globalThis, "__name", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: function(target, value) {
          try {
            Object.defineProperty(target, "name", {
              configurable: true,
              value: value
            });
          } catch (_) {}
          return target;
        }
      });
    `);

    const page = await context.newPage();

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) {
        return;
      }

      assertAllowedNavigationUrl(
        frame.url(),
        policy,
      );
    });

    await page.goto(options.startUrl, {
      waitUntil: "domcontentloaded",
    });

    assertAllowedNavigationUrl(
      page.url(),
      policy,
    );

    return new LearnerBrowser(
      browser,
      context,
      page,
      policy,
    );
  }

  get currentUrl(): string {
    return this.#page.url();
  }

  getEvidence(): LearnerBrowserEvidence {
    return this.#log.snapshot();
  }

  async observe(): Promise<LearnerPageSnapshot> {
    assertAllowedNavigationUrl(
      this.#page.url(),
      this.policy,
    );

    const before = this.#page.url();

    const snapshot = await this.#page.evaluate(
      ({
        attributeName,
        maxElementText,
      }) => {
        const isVisible = (
          element: Element,
        ): boolean => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const style =
            window.getComputedStyle(element);
          const rect =
            element.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };

        const selector = [
          "a[href]",
          "button",
          "input",
          "textarea",
          "select",
          "[role='button']",
          "[role='link']",
          "[role='checkbox']",
          "[role='radio']",
          "[role='tab']",
          "[role='option']",
          "[contenteditable='true']",
        ].join(",");

        const elements = Array.from(
          document.querySelectorAll(selector),
        )
          .filter(isVisible)
          .slice(0, 300);

        for (
          const existing
          of document.querySelectorAll(
            `[${attributeName}]`,
          )
        ) {
          existing.removeAttribute(
            attributeName,
          );
        }

        const mapped = elements.map(
          (element, index) => {
            const id = `e${index + 1}`;
            element.setAttribute(
              attributeName,
              id,
            );

            const html =
              element as HTMLElement;
            const input =
              element instanceof HTMLInputElement
                ? element
                : null;
            const textarea =
              element instanceof HTMLTextAreaElement
                ? element
                : null;
            const select =
              element instanceof HTMLSelectElement
                ? element
                : null;

            const inputType =
              input?.type ?? null;
            const isSecret =
              inputType === "password";

            let value: string | null = null;

            if (!isSecret) {
              if (input) {
                value = input.value;
              } else if (textarea) {
                value = textarea.value;
              } else if (select) {
                value = select.value;
              }
            }

            const rawText = (
              html.innerText ||
              html.textContent ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim();

            return {
              id,
              tag:
                element.tagName.toLowerCase(),
              role:
                element.getAttribute("role"),
              text:
                rawText.length > maxElementText
                  ? `${rawText.slice(
                      0,
                      maxElementText,
                    )}...`
                  : rawText,
              ariaLabel:
                element.getAttribute(
                  "aria-label",
                ),
              placeholder:
                input?.placeholder ??
                textarea?.placeholder ??
                null,
              inputType,
              value,
              disabled:
                "disabled" in element
                  ? Boolean(
                      (
                        element as
                          | HTMLButtonElement
                          | HTMLInputElement
                          | HTMLSelectElement
                          | HTMLTextAreaElement
                      ).disabled,
                    )
                  : element.getAttribute(
                        "aria-disabled",
                      ) === "true",
              testId:
                element.getAttribute(
                  "data-testid",
                ),
            };
          },
        );

        return {
          url: window.location.href,
          title: document.title,
          visibleText:
            document.body?.innerText ?? "",
          elements: mapped,
        };
      },
      {
        attributeName:
          AGENT_ID_ATTRIBUTE,
        maxElementText:
          MAX_ELEMENT_TEXT,
      },
    );

    assertAllowedNavigationUrl(
      snapshot.url,
      this.policy,
    );

    this.#log.record({
      kind: "observe",
      action: "observe_student_ui",
      urlBefore: before,
      urlAfter: snapshot.url,
      detail: snapshot.title,
    });

    return {
      ...snapshot,
      visibleText: truncate(
        snapshot.visibleText,
        MAX_VISIBLE_TEXT,
      ),
    };
  }

  async inspectZoeSkoulState(): Promise<ZoeSkoulLearnerState> {
    assertAllowedNavigationUrl(
      this.#page.url(),
      this.policy,
    );

    const state =
      await this.#page.evaluate(
        ({ maxEditorText }) => {
          const visible = (
            element: Element,
          ): boolean => {
            if (!(element instanceof HTMLElement)) {
              return false;
            }

            const style =
              window.getComputedStyle(element);
            const rect =
              element.getBoundingClientRect();

            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          };

          const elementText = (
            element: Element | null,
          ): string => (
            (
              element as HTMLElement | null
            )?.innerText ??
            element?.textContent ??
            ""
          )
            .replace(/\s+/g, " ")
            .trim();

          const practiceIds = [
            "review-practice-submit-button",
            "review-practice-next-button",
            "review-practice-finish-button",
          ];

          let primaryPracticeAction:
            | {
                testId: string;
                text: string;
                disabled: boolean;
              }
            | null = null;

          for (const testId of practiceIds) {
            const candidate =
              document.querySelector(
                `[data-testid="${testId}"]`,
              );

            if (
              candidate &&
              visible(candidate)
            ) {
              primaryPracticeAction = {
                testId,
                text:
                  elementText(candidate),
                disabled:
                  candidate instanceof
                  HTMLButtonElement
                    ? candidate.disabled
                    : candidate.getAttribute(
                        "aria-disabled",
                      ) === "true",
              };
              break;
            }
          }

          const reveal =
            document.querySelector(
              '[data-testid="review-practice-reveal-button"]',
            );

          const mountedMonacos =
            Array.from(
              document.querySelectorAll(
                ".monaco-editor",
              ),
            );

          const visibleMonacos =
            mountedMonacos.filter(
              visible,
            );

          const monaco =
            visibleMonacos[0] ?? null;

          const editorText = monaco
            ? elementText(
                monaco.querySelector(
                  ".view-lines",
                ),
              )
            : "";

          const runCandidates =
            Array.from(
              document.querySelectorAll(
                "button",
              ),
            )
              .filter(visible)
              .map((button) => ({
                element: button,
                text: elementText(button),
              }))
              .filter(({ text }) =>
                /^(run|run sql|run query|run code)$/i.test(
                  text,
                ),
              );

          const run =
            runCandidates[0] ?? null;

          const feedback =
            Array.from(
              document.querySelectorAll(
                [
                  "[aria-live='polite']",
                  "[aria-live='assertive']",
                  "[role='status']",
                  "[data-testid*='feedback']",
                ].join(","),
              ),
            )
              .filter(visible)
              .map((element) =>
                elementText(element),
              )
              .filter(Boolean)
              .filter(
                (value, index, all) =>
                  all.indexOf(value) === index,
              )
              .slice(-12);

          const bodyText =
            document.body?.innerText ?? "";

          const attemptsMatch =
            bodyText.match(
              /Attempts?\s*:\s*[^\n]+/i,
            );

          const fixedContainers =
            Array.from(
              document.querySelectorAll(
                ".fixed",
              ),
            ).filter(visible);

          const bottomActions =
            fixedContainers
              .flatMap((container) =>
                Array.from(
                  container.querySelectorAll(
                    "button, a",
                  ),
                ),
              )
              .filter(visible)
              .map((element) => ({
                text:
                  elementText(element),
                disabled:
                  element instanceof
                  HTMLButtonElement
                    ? element.disabled
                    : element.getAttribute(
                        "aria-disabled",
                      ) === "true" ||
                      element.getAttribute(
                        "data-disabled",
                      ) === "true",
              }))
              .filter(
                (item) => item.text,
              )
              .slice(-12);

          const headings =
            Array.from(
              document.querySelectorAll(
                "main h1, main h2, main h3, h1, h2, h3",
              ),
            )
              .filter(visible)
              .map((element) =>
                elementText(element),
              )
              .filter(Boolean)
              .slice(0, 12);

          const navigationStatus =
            Array.from(
              document.querySelectorAll(
                "[role='status']",
              ),
            )
              .filter(visible)
              .map((element) =>
                elementText(element),
              )
              .find((value) =>
                /load|open|sav|check|run|navigat/i.test(
                  value,
                ),
              ) ?? null;

          return {
            title: document.title,
            headings,
            busy: Boolean(
              document.querySelector(
                "[aria-busy='true']",
              ),
            ),
            navigationStatus,
            primaryPracticeAction,
            revealAvailable:
              Boolean(
                reveal &&
                visible(reveal) &&
                !(
                  reveal instanceof
                    HTMLButtonElement &&
                  reveal.disabled
                ),
              ),
            attemptsText:
              attemptsMatch?.[0] ?? null,
            monacoVisible:
              Boolean(monaco),
            monacoMountedCount:
              mountedMonacos.length,
            monacoVisibleCount:
              visibleMonacos.length,
            visibleEditorText:
              editorText
                ? editorText.length >
                  maxEditorText
                  ? `${editorText.slice(
                      0,
                      maxEditorText,
                    )}...[truncated]`
                  : editorText
                : null,
            runAction: run
              ? {
                  text: run.text,
                  disabled:
                    run.element.disabled,
                }
              : null,
            feedback,
            bottomActions,
            moduleCompleteSignal:
              /module complete|course complete|assignment complete|view certificate|get certificate/i.test(
                bodyText,
              ),
          };
        },
        {
          maxEditorText:
            MAX_EDITOR_TEXT,
        },
      );

    return {
      url: this.#page.url(),
      surface:
        classifyZoeSkoulSurface(
          this.#page.url(),
        ),
      ...state,
    };
  }

  async click(id: string): Promise<void> {
    const before = this.#page.url();

    const target =
      this.#page.locator(
        `[${AGENT_ID_ATTRIBUTE}="${id}"]`,
      );

    if ((await target.count()) !== 1) {
      throw new Error(
        `Interactive element ${id} is missing or ambiguous. Observe the page again.`,
      );
    }

    const label = normalizeText(
      (await target
        .innerText()
        .catch(() => "")) ||
        (await target.getAttribute(
          "aria-label",
        )) ||
        "",
    );

    if (
      shouldRejectGenericModulesProgressionClick({
        currentUrl: before,
        text: label,
      })
    ) {
      throw new Error(
        [
          "Student Agent forward-navigation guard rejected the header Modules control.",
          "Modules is a navigation-away control, not a forward-progress action inside an active learner flow.",
          "Re-observe and use the enabled learner-flow CTA such as Finish practice, Finish quiz, Finish, Next, Next topic, Quiz, Mark as read, or Continue.",
          "Use continue_to_next_module only after the current module is genuinely complete.",
          "This harness rejection is not a learner-visible blocker.",
        ].join(" "),
      );
    }

    await target.click();
    await this.#settle();

    this.#log.record({
      kind: "click",
      action: id,
      urlBefore: before,
      urlAfter: this.#page.url(),
      detail: label || null,
    });
  }

  async fill(
    id: string,
    text: string,
  ): Promise<void> {
    const before = this.#page.url();

    const target =
      this.#page.locator(
        `[${AGENT_ID_ATTRIBUTE}="${id}"]`,
      );

    if ((await target.count()) !== 1) {
      throw new Error(
        `Editable element ${id} is missing or ambiguous. Observe the page again.`,
      );
    }

    await target.fill(text);
    await this.#settle(100);

    this.#log.record({
      kind: "fill",
      action: id,
      urlBefore: before,
      urlAfter: this.#page.url(),
      detail: `${text.length} characters`,
    });
  }

  async typeText(
    text: string,
  ): Promise<void> {
    const before = this.#page.url();

    await this.#page.keyboard.type(
      text,
      {
        delay: 2,
      },
    );

    await this.#settle(80);

    this.#log.record({
      kind: "type",
      action: "keyboard_type",
      urlBefore: before,
      urlAfter: this.#page.url(),
      detail: `${text.length} characters`,
    });
  }

  async press(key: string): Promise<void> {
    const before = this.#page.url();

    await this.#page.keyboard.press(key);
    await this.#settle(100);

    this.#log.record({
      kind: "press",
      action: key,
      urlBefore: before,
      urlAfter: this.#page.url(),
      detail: null,
    });
  }

  async scroll(
    direction: "up" | "down",
    amount: number,
  ): Promise<void> {
    const before = this.#page.url();

    const delta = Math.max(
      100,
      Math.min(
        Math.abs(amount),
        2400,
      ),
    );

    await this.#page.mouse.wheel(
      0,
      direction === "down"
        ? delta
        : -delta,
    );

    await this.#settle(80);

    this.#log.record({
      kind: "scroll",
      action: direction,
      urlBefore: before,
      urlAfter: this.#page.url(),
      detail: String(delta),
    });
  }

  async wait(
    milliseconds: number,
  ): Promise<void> {
    await this.#page.waitForTimeout(
      Math.max(
        50,
        Math.min(
          milliseconds,
          10_000,
        ),
      ),
    );
  }

  async ensurePrimaryEditorVisible(): Promise<ZoeSkoulLearnerState> {
    const before =
      await this.inspectZoeSkoulState();

    if (before.monacoVisible) {
      return before;
    }

    const waitForEditor = async () => {
      const deadline =
        Date.now() + 10_000;

      while (Date.now() < deadline) {
        const state =
          await this.inspectZoeSkoulState();

        if (state.monacoVisible) {
          return state;
        }

        await this.#page.waitForTimeout(
          250,
        );
      }

      return null;
    };

    // Narrow CodeRunner switches to Output after Run. Its real learner-facing
    // way back is a BUTTON named "Editor" with aria-pressed, not a tab.
    const editorButtons =
      this.#page
        .getByRole(
          "button",
          { name: /^Editor$/i },
        );

    const editorButtonCount =
      await editorButtons.count();

    for (
      let index = 0;
      index < editorButtonCount;
      index += 1
    ) {
      const button =
        editorButtons.nth(index);

      if (
        !(await button
          .isVisible()
          .catch(() => false))
      ) {
        continue;
      }

      const ariaPressed =
        await button.getAttribute(
          "aria-pressed",
        );

      if (ariaPressed === null) {
        continue;
      }

      await button.click();

      const ready =
        await waitForEditor();

      this.#log.record({
        kind: "semantic",
        action: "open_editor_surface",
        urlBefore: before.url,
        urlAfter:
          ready?.url ??
          this.#page.url(),
        detail: "Editor button",
      });

      if (ready) {
        return ready;
      }
    }

    const launchCard =
      this.#page
        .getByTestId(
          "code-input-tools-launch-card",
        )
        .first();

    if (
      (await launchCard.count()) > 0 &&
      (await launchCard
        .isVisible()
        .catch(() => false))
    ) {
      const launchButton =
        launchCard
          .getByRole(
            "button",
            {
              name:
                /(?:Open Code|Jump to Code|Open in Tools|Open the full code workspace)/i,
            },
          )
          .first();

      if (
        (await launchButton.count()) > 0 &&
        (await launchButton
          .isVisible()
          .catch(() => false)) &&
        !(await launchButton
          .isDisabled()
          .catch(() => false))
      ) {
        await launchButton.click();

        const ready =
          await waitForEditor();

        this.#log.record({
          kind: "semantic",
          action: "open_editor_surface",
          urlBefore: before.url,
          urlAfter:
            ready?.url ??
            this.#page.url(),
          detail: "code-input-launcher",
        });

        if (ready) {
          return ready;
        }
      }
    }

    const openCodeButtons = [
      /^(?:Open Code|Jump to Code)$/i,
      /^Tools(?:\s*▶)?$/i,
    ];

    for (const name of openCodeButtons) {
      const button =
        this.#page
          .getByRole(
            "button",
            { name },
          )
          .first();

      if (
        (await button.count()) === 0 ||
        !(await button
          .isVisible()
          .catch(() => false)) ||
        (await button
          .isDisabled()
          .catch(() => false))
      ) {
        continue;
      }

      const label =
        (await button
          .innerText()
          .catch(() => "")) ||
        name.source;

      await button.click();

      const ready =
        await waitForEditor();

      this.#log.record({
        kind: "semantic",
        action: "open_editor_surface",
        urlBefore: before.url,
        urlAfter:
          ready?.url ??
          this.#page.url(),
        detail: label,
      });

      if (ready) {
        return ready;
      }
    }

    const finalState =
      await this.inspectZoeSkoulState();

    throw new Error(
      [
        "Could not expose the learner Monaco editor through ZoeSkoul's visible code controls.",
        `mountedMonaco=${finalState.monacoMountedCount}`,
        `visibleMonaco=${finalState.monacoVisibleCount}`,
        `surface=${finalState.surface}`,
        `url=${finalState.url}`,
      ].join(" "),
    );
  }

  async replacePrimaryEditorText(
    text: string,
  ): Promise<void> {
    const before =
      this.#page.url();

    this.#log.record({
      kind: "type",
      action:
        "replace_primary_code_editor_attempt",
      urlBefore: before,
      urlAfter: before,
      detail:
        `attempting ${text.length} characters`,
    });

    try {
      await this.ensurePrimaryEditorVisible();

      const monacos =
        this.#page.locator(
          ".monaco-editor:visible",
        );

      const count =
        await monacos.count();

      let monaco:
        ReturnType<
          typeof monacos.nth
        > | null = null;

      for (
        let index = 0;
        index < count;
        index += 1
      ) {
        const candidate =
          monacos.nth(index);

        const usable =
          await candidate.evaluate(
            (element) => {
              let current:
                Element | null =
                element;

              while (current) {
                if (
                  current.getAttribute(
                    "aria-hidden",
                  ) === "true"
                ) {
                  return false;
                }

                const style =
                  window.getComputedStyle(
                    current,
                  );

                if (
                  style.display === "none" ||
                  style.visibility === "hidden" ||
                  Number(style.opacity) === 0
                ) {
                  return false;
                }

                current =
                  current.parentElement;
              }

              return true;
            },
          );

        if (usable) {
          monaco = candidate;
          break;
        }
      }

      if (!monaco) {
        throw new Error(
          `No active visible Monaco editor was found among ${count} visible candidates.`,
        );
      }

      await monaco.click({
        position: {
          x: 48,
          y: 32,
        },
      });

      const nativeEditContext =
        monaco
          .locator(
            ".native-edit-context",
          )
          .first();

      const legacyTextarea =
        monaco
          .locator(
            "textarea.inputarea",
          )
          .first();

      let inputMode =
        "monaco-root";

      if (
        (await nativeEditContext.count()) > 0
      ) {
        inputMode =
          "native-edit-context";

        await nativeEditContext
          .focus()
          .catch(() => undefined);
      } else if (
        (await legacyTextarea.count()) > 0
      ) {
        inputMode =
          "textarea.inputarea";

        await legacyTextarea.waitFor({
          state: "attached",
          timeout: 10_000,
        });

        await legacyTextarea.focus();
      }

      await this.#page.keyboard.press(
        process.platform === "darwin"
          ? "Meta+A"
          : "Control+A",
      );

      // Use real key events rather than insertText so Chromium/Monaco's
      // native EditContext receives the same keyboard path as a learner.
      const lines =
        text.split(/\r?\n/);

      for (
        let index = 0;
        index < lines.length;
        index += 1
      ) {
        if (index > 0) {
          await this.#page.keyboard.press(
            "Enter",
          );
        }

        if (lines[index]) {
          await this.#page.keyboard.type(
            lines[index]!,
            {
              delay: 1,
            },
          );
        }
      }

      await this.#page.waitForTimeout(
        300,
      );

      const after =
        await this.inspectZoeSkoulState();

      const normalize =
        (value: string) =>
          value
            .replace(/\r\n/g, "\n")
            .replace(/\u00a0/g, " ")
            .split("\n")
            .map((line) =>
              line.replace(/\s+$/g, ""),
            )
            .join("\n")
            .trim();

      const expected =
        normalize(text);

      const actual =
        normalize(
          after.visibleEditorText ??
            "",
        );

      if (
        !expected ||
        actual !== expected
      ) {
        throw new Error(
          [
            "The learner-visible Monaco editor did not exactly match Agent 1's intended text after typing.",
            `inputMode=${inputMode}`,
            `expected=${JSON.stringify(expected)}`,
            `actual=${JSON.stringify(actual)}`,
            `mountedMonaco=${after.monacoMountedCount}`,
            `visibleMonaco=${after.monacoVisibleCount}`,
            `url=${after.url}`,
          ].join(" "),
        );
      }

      this.#log.record({
        kind: "type",
        action:
          "replace_primary_code_editor",
        urlBefore: before,
        urlAfter:
          this.#page.url(),
        detail:
          `typed ${text.length} characters via ${inputMode} and verified exact visible text`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.#log.record({
        kind: "type",
        action:
          "replace_primary_code_editor_failed",
        urlBefore: before,
        urlAfter:
          this.#page.url(),
        detail:
          message.slice(0, 800),
      });

      throw error;
    }
  }

  async continueToNextModule(): Promise<ZoeSkoulLearnerState> {
    const before =
      await this.inspectZoeSkoulState();

    const clickAndSettle = async (
      locator: Locator,
      detail: string,
    ): Promise<ZoeSkoulLearnerState | null> => {
      if (
        (await locator.count()) === 0 ||
        !(await locator
          .isVisible()
          .catch(() => false)) ||
        (await locator
          .isDisabled()
          .catch(() => false))
      ) {
        return null;
      }

      await locator.click();

      const state =
        await this.waitForZoeSkoulStateToSettle(
          8_000,
        );

      this.#log.record({
        kind: "semantic",
        action:
          "continue_to_next_module",
        urlBefore: before.url,
        urlAfter: state.url,
        detail,
      });

      return state;
    };

    // Prefer a learner-visible completion dialog when ZoeSkoul presents one.
    const dialogs =
      this.#page.getByRole(
        "dialog",
      );

    const dialogCount =
      await dialogs.count();

    for (
      let index = 0;
      index < dialogCount;
      index += 1
    ) {
      const dialog =
        dialogs.nth(index);

      if (
        !(await dialog
          .isVisible()
          .catch(() => false))
      ) {
        continue;
      }

      const dialogText =
        await dialog
          .innerText()
          .catch(() => "");

      if (
        !/(?:module\s+(?:complete|completed)|completed\s+module|next\s+module)/i.test(
          dialogText,
        )
      ) {
        continue;
      }

      const specificButton =
        dialog
          .getByRole(
            "button",
            {
              name:
                /^(?:Next module|Start next module|Continue to next module|Go to next module)$/i,
            },
          )
          .first();

      const fromSpecificButton =
        await clickAndSettle(
          specificButton,
          "completion dialog: next module button",
        );

      if (fromSpecificButton) {
        return fromSpecificButton;
      }

      const specificLink =
        dialog
          .getByRole(
            "link",
            {
              name:
                /^(?:Next module|Start next module|Continue to next module|Go to next module)$/i,
            },
          )
          .first();

      const fromSpecificLink =
        await clickAndSettle(
          specificLink,
          "completion dialog: next module link",
        );

      if (fromSpecificLink) {
        return fromSpecificLink;
      }

      // Some completion dialogs use a generic Continue CTA. Only accept it
      // after proving the dialog itself is a module-completion surface.
      const continueButton =
        dialog
          .getByRole(
            "button",
            {
              name:
                /^(?:Continue|Continue learning)$/i,
            },
          )
          .first();

      const fromContinue =
        await clickAndSettle(
          continueButton,
          "completion dialog: continue",
        );

      if (fromContinue) {
        return fromContinue;
      }
    }

    // ZoeSkoul's compact ReviewModule navigation contract labels the true
    // module-boundary action "Next module". Earlier in-module actions use
    // contextual labels such as Practice, Quiz, Next topic, etc.
    const nextModuleButton =
      this.#page
        .getByRole(
          "button",
          {
            name: /^Next module$/i,
          },
        )
        .first();

    const fromButton =
      await clickAndSettle(
        nextModuleButton,
        "normal navigation: Next module button",
      );

    if (fromButton) {
      return fromButton;
    }

    const nextModuleLink =
      this.#page
        .getByRole(
          "link",
          {
            name: /^Next module$/i,
          },
        )
        .first();

    const fromLink =
      await clickAndSettle(
        nextModuleLink,
        "normal navigation: Next module link",
      );

    if (fromLink) {
      return fromLink;
    }

    const after =
      await this.inspectZoeSkoulState();

    throw new Error(
      [
        "No learner-visible next-module continuation is available.",
        "Checked a visible module-completion dialog first, then the normal exact Next module control.",
        `moduleCompleteSignal=${String(after.moduleCompleteSignal)}`,
        `bottomActions=${JSON.stringify(after.bottomActions)}`,
        `url=${after.url}`,
      ].join(" "),
    );
  }

  async performSemanticAction(
    action: ZoeSkoulSemanticAction,
  ): Promise<void> {
    const before = this.#page.url();

    const target =
      await this.#semanticLocator(
        action,
      );

    if (
      !target ||
      (await target.count()) === 0
    ) {
      throw new Error(
        `Learner action "${action}" is not currently visible.`,
      );
    }

    if (
      await target
        .isDisabled()
        .catch(() => false)
    ) {
      throw new Error(
        `Learner action "${action}" is currently disabled.`,
      );
    }

    const label = normalizeText(
      (await target
        .innerText()
        .catch(() => "")) ||
        (await target.getAttribute(
          "aria-label",
        )) ||
        "",
    );

    await target.click();

    await this.waitForZoeSkoulStateToSettle(
      7_000,
    );

    this.#log.record({
      kind: "semantic",
      action,
      urlBefore: before,
      urlAfter: this.#page.url(),
      detail: label || null,
    });
  }

  async waitForZoeSkoulStateToSettle(
    timeoutMs = 5_000,
  ): Promise<ZoeSkoulLearnerState> {
    const deadline =
      Date.now() +
      Math.max(
        300,
        Math.min(timeoutMs, 15_000),
      );

    let previous = "";
    let stable = 0;

    while (Date.now() < deadline) {
      const state =
        await this.inspectZoeSkoulState();

      const fingerprint =
        JSON.stringify({
          url: state.url,
          headings: state.headings,
          busy: state.busy,
          navigationStatus:
            state.navigationStatus,
          primary:
            state.primaryPracticeAction,
          attempts:
            state.attemptsText,
          feedback:
            state.feedback,
          editor:
            state.visibleEditorText,
          bottom:
            state.bottomActions,
        });

      if (
        fingerprint === previous &&
        !state.busy
      ) {
        stable += 1;

        if (stable >= 2) {
          return state;
        }
      } else {
        previous = fingerprint;
        stable = 0;
      }

      await this.#page.waitForTimeout(
        180,
      );
    }

    return this.inspectZoeSkoulState();
  }

  async close(): Promise<void> {
    await this.#context.close();
    await this.#browser.close();
  }

  async #semanticLocator(
    action: ZoeSkoulSemanticAction,
  ): Promise<Locator | null> {
    if (action === "check_answer") {
      return this.#page
        .getByTestId(
          "review-practice-submit-button",
        )
        .first();
    }

    if (action === "reveal") {
      return this.#page
        .getByTestId(
          "review-practice-reveal-button",
        )
        .first();
    }

    if (action === "practice_next") {
      return this.#page
        .getByTestId(
          "review-practice-next-button",
        )
        .first();
    }

    if (action === "finish") {
      return this.#page
        .getByTestId(
          "review-practice-finish-button",
        )
        .first();
    }

    if (action === "modules") {
      return this.#page
        .getByTestId(
          "review-course-modules-button",
        )
        .first();
    }

    const names =
      action === "run"
        ? [
            /^Run$/i,
            /^Run SQL$/i,
            /^Run query$/i,
            /^Run code$/i,
          ]
        : [];

    for (const name of names) {
      const locator =
        this.#page
          .getByRole(
            "button",
            {
              name,
            },
          )
          .first();

      if (
        (await locator.count()) > 0 &&
        (await locator
          .isVisible()
          .catch(() => false))
      ) {
        return locator;
      }
    }

    return null;
  }

  async #settle(
    extraDelay = 0,
  ): Promise<void> {
    if (extraDelay > 0) {
      await this.#page.waitForTimeout(
        extraDelay,
      );
    }

    await this.#page
      .waitForLoadState(
        "domcontentloaded",
        {
          timeout: 2_500,
        },
      )
      .catch(() => undefined);

    assertAllowedNavigationUrl(
      this.#page.url(),
      this.policy,
    );
  }
}
