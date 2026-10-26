/**
 * Shared client/server intent gate for targeted project edits.
 * Recognizes natural requests without requiring a specific command verb such as "create".
 * This is an inexpensive routing hint; the server still validates authorization,
 * source versions, target paths, and every proposed change.
 */
const EDIT_ACTION = /\b(?:add|adding|create|creating|build|building|change|edit|modify|update|adjust|fix|improve|redesign|remove|replace|make|style|rewrite|implement|put|putting|move|moving|separate|split|extract|relocate|turn|convert|place)\b/i;
const STANDALONE_PAGE = /\b(?:page|pages|route|routes|standalone\s+document|separate\s+document|own\s+url)\b/i;

export function isZoeSourceEditInstruction(prompt: string): boolean {
  return EDIT_ACTION.test(prompt);
}

export function isZoeStandalonePageInstruction(prompt: string): boolean {
  return isZoeSourceEditInstruction(prompt) && STANDALONE_PAGE.test(prompt);
}
