import type { ZoeSourceEditProposal } from "./zoeTargetedSourceEdit";
export type ZoeEditStreamEvent = {event: string; data: Record<string, unknown>};

/** Parse the authenticated same-origin edit stream; only typed events affect UI. */
export async function readZoeEditEventStream(input: Readonly<{
  response: Response;
  onReasoning(delta: string): void;
  onStatus(phase: "model_requested" | "proposal_validated" | "build_verification"): void;
}>): Promise<{proposal: ZoeSourceEditProposal | null; clarification: string | null; reasoningSummary?: string}> {
  const reader = input.response.body?.getReader();
  if (!reader) throw new Error("AI edit returned no response stream.");
  const decoder = new TextDecoder();
  let buffer = "", bytes = 0;
  let completed: {proposal: ZoeSourceEditProposal | null; clarification: string | null; reasoningSummary?: string} | null = null;
  const parseEvent = (block: string) => {
    const event = block.split("\n").find(line => line.startsWith("event: "))?.slice(7);
    const raw = block.split("\n").filter(line => line.startsWith("data: ")).map(line => line.slice(6)).join("\n");
    if (!event || !raw) return;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (event === "status" && (data.phase === "model_requested" || data.phase === "proposal_validated" || data.phase === "build_verification")) {
      input.onStatus(data.phase);
    } else if (event === "reasoning" && typeof data.delta === "string") {
      input.onReasoning(data.delta.slice(0, 4096));
    } else if (event === "failure") {
      throw new Error(typeof data.message === "string" ? data.message : "AI edit failed.");
    } else if (event === "proposal" && data.ok === true && data.proposal && typeof data.proposal === "object") {
      completed = {proposal: data.proposal as ZoeSourceEditProposal, clarification: null,
        reasoningSummary: typeof data.reasoningSummary === "string" ? data.reasoningSummary : undefined};
    } else if (event === "clarification" && data.ok === true &&
        typeof data.clarification === "string" && data.clarification.length <= 500) {
      completed = {proposal: null, clarification: data.clarification};
    }
  };
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 300_000) throw new Error("AI edit stream exceeded the safe response size.");
      buffer += decoder.decode(value,{stream:true});
      buffer = buffer.replace(/\r\n/g,"\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        parseEvent(buffer.slice(0,end));
        buffer = buffer.slice(end+2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) parseEvent(buffer);
  } finally { reader.releaseLock(); }
  if (!completed) throw new Error("AI edit stream ended without a validated proposal or clarification.");
  return completed;
}
