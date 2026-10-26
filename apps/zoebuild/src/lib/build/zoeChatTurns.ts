/** ZoeBuild chat role belongs to the turn, never a visible "You:" text prefix.
 * Chat stays in memory as before; no local or server storage is introduced. */
export type ZoeChatTurn = Readonly<{
  role: "user" | "assistant";
  text: string;
  clientTurnId?: string;
}>;

export function makeZoeChatTurn(role: ZoeChatTurn["role"], text: string): ZoeChatTurn {
  return {role, text};
}
