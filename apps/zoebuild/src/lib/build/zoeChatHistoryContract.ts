/** Storage safety boundary (not a response-generation character quota). */
export const ZOE_CHAT_MESSAGE_MAX_UTF8_BYTES = 128 * 1024;

/** Transport-safe Zoé chat turn. No chain-of-thought or billing IDs. */
export type ZoeChatSubmission = Readonly<{
  clientTurnId: string;
  role: "user" | "assistant";
  text: string;
}>;

export function parseZoeChatSubmission(value: unknown): ZoeChatSubmission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.clientTurnId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.clientTurnId)) return null;
  if (item.role !== "user" && item.role !== "assistant") return null;
  if (typeof item.text !== "string" || !item.text.trim() ||
      new TextEncoder().encode(item.text).length > ZOE_CHAT_MESSAGE_MAX_UTF8_BYTES) return null;
  return {clientTurnId:item.clientTurnId,role:item.role,text:item.text};
}
