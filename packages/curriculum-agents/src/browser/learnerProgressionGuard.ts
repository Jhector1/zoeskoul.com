export type LearnerProgressionClick = {
  currentUrl: string;
  text?: string | null;
  ariaLabel?: string | null;
};

function normalizedLabel(
  input: LearnerProgressionClick,
): string {
  return (
    input.text?.trim() ||
    input.ariaLabel?.trim() ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldRejectGenericModulesProgressionClick(
  input: LearnerProgressionClick,
): boolean {
  let pathname = "";

  try {
    pathname =
      new URL(input.currentUrl).pathname;
  } catch {
    return false;
  }

  const insideLearnerFlow =
    /\/learn(?:\/|$)/.test(pathname);

  return (
    insideLearnerFlow &&
    /^Modules$/i.test(
      normalizedLabel(input),
    )
  );
}
