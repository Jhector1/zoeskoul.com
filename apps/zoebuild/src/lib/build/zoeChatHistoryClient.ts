import type { ZoeChatTurn } from "./zoeChatTurns";
import { parseZoeChatSubmission } from "./zoeChatHistoryContract";

/** Browser-side decode, never used as authorization; the server owns access. */
export function readZoeChatHistoryPayload(value: unknown): ZoeChatTurn[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.ok !== true || !Array.isArray(data.messages) || data.messages.length > 120) return null;
  const turns: ZoeChatTurn[] = [];
  const ids = new Set<string>();
  for (const raw of data.messages) {
    const turn = parseZoeChatSubmission(raw);
    if (!turn || ids.has(turn.clientTurnId)) return null;
    ids.add(turn.clientTurnId);
    turns.push({role:turn.role,text:turn.text,clientTurnId:turn.clientTurnId});
  }
  return turns;
}

export function mergeZoeChatHistory(restored: readonly ZoeChatTurn[], local: readonly ZoeChatTurn[]) {
  const ids = new Set(restored.map(turn => turn.clientTurnId));
  return [...restored, ...local.filter(turn => !turn.clientTurnId || !ids.has(turn.clientTurnId))];
}
