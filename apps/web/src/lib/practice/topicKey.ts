// A stable identifier for a topic across locales and UI.
// IMPORTANT: use this same key everywhere (persist progress + count progress).
export function makeTopicKey(args: {
  subjectSlug: string;
  moduleSlug: string;
  topicSlug: string;
}) {
  return `topic|subject=${args.subjectSlug}|module=${args.moduleSlug}|topic=${args.topicSlug}`;
}
