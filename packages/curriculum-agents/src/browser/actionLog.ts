export type LearnerActionKind =
  | "observe"
  | "click"
  | "fill"
  | "type"
  | "press"
  | "scroll"
  | "semantic";

export type LearnerActionEvent = {
  sequence: number;
  at: string;
  kind: LearnerActionKind;
  action: string;
  urlBefore: string;
  urlAfter: string;
  detail: string | null;
};

export type LearnerBrowserEvidence = {
  events: LearnerActionEvent[];
  clickCount: number;
  checkAnswerClicks: number;
  runClicks: number;
  revealClicks: number;
  practiceNextClicks: number;
  finishClicks: number;
  modulesClicks: number;
};

export class LearnerActionLog {
  #sequence = 0;
  #events: LearnerActionEvent[] = [];

  record(
    event: Omit<LearnerActionEvent, "sequence" | "at">,
  ): void {
    this.#events.push({
      sequence: ++this.#sequence,
      at: new Date().toISOString(),
      ...event,
    });
  }

  snapshot(): LearnerBrowserEvidence {
    const events = this.#events.map((event) => ({
      ...event,
    }));

    const semantic = (name: string) =>
      events.filter(
        (event) =>
          event.kind === "semantic" &&
          event.action === name,
      ).length;

    return {
      events,
      clickCount: events.filter(
        (event) => event.kind === "click",
      ).length,
      checkAnswerClicks: semantic("check_answer"),
      runClicks: semantic("run"),
      revealClicks: semantic("reveal"),
      practiceNextClicks: semantic("practice_next"),
      finishClicks: semantic("finish"),
      modulesClicks: semantic("modules"),
    };
  }
}
