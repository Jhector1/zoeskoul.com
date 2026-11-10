import type { LearningVisibilityItem } from "@zoeskoul/api-contracts";

export function selectVisibilityItems(
  items: readonly LearningVisibilityItem[],
  query: string,
  filter: "all" | "visible" | "hidden",
): LearningVisibilityItem[] {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(item =>
    (filter === "all" || (filter === "hidden") === item.hidden) &&
    (!search || `${item.title} ${item.slug}`.toLocaleLowerCase().includes(search))
  );
}
