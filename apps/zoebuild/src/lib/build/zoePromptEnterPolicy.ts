/** Shared Zoé composer key policy. Prevent IME confirmation from submitting. */
export function shouldSubmitZoePromptOnEnter(input: Readonly<{
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode?: number;
}>): boolean {
  return input.key === "Enter" && !input.shiftKey &&
    !input.isComposing && input.keyCode !== 229;
}
