/** Exact server error codes, never prompt wording or a client-side zero-balance guess. */
const CODES=new Set(["INSUFFICIENT_CREDITS","AI_CREDITS_INSUFFICIENT","BUILD_AI_CREDITS_EXHAUSTED"]);
export function isAiCreditShortageCode(code:unknown):boolean {
  return typeof code==="string" && CODES.has(code);
}
export function isAiCreditShortage(error:unknown):boolean {
  return Boolean(error && typeof error==="object" && "code" in error &&
    isAiCreditShortageCode((error as {code:unknown}).code));
}
export class ZoeAiCreditShortageError extends Error {
  readonly code="INSUFFICIENT_CREDITS";
  constructor(){super("AI credits are insufficient for this request. Nothing was charged or changed.");
    this.name="ZoeAiCreditShortageError";}
}
