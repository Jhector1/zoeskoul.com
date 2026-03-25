// src/features/practice/client/topicOptions.ts
"use client";

import { useEffect, useState } from "react";
import type { TopicSlug } from "@/lib/practice/types";

export type TopicValue = TopicSlug | "all";

export type TopicOption = {
  id: "all" | TopicSlug;
  label: string;
  meta?: any;
};

export async function fetchTopicOptions(
  subjectSlug: string,
  moduleSlug: string,
  signal?: AbortSignal,
): Promise<TopicOption[]> {
  const qs = new URLSearchParams({ subject: subjectSlug, module: moduleSlug });
  const res = await fetch(`/api/catalog/topics?${qs}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load topics (${res.status})`);
  const data = await res.json();

  const topics = Array.isArray(data?.topics) ? data.topics : [];
  return [
    { id: "all" as const, label: "All topics" },
    ...topics.map((t: any) => ({
      id: String(t.slug) as TopicSlug,
      label: String(t.label ?? t.slug),
      meta: t.meta,
    })),
  ];
}

export function useTopicOptions(subjectSlug: string, moduleSlug: string) {
  const [topicOptionsFixed, setTopicOptionsFixed] = useState<TopicOption[]>([
    { id: "all", label: "All topics" },
  ]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchTopicOptions(subjectSlug, moduleSlug, ctrl.signal)
      .then(setTopicOptionsFixed)
      .catch(() => setTopicOptionsFixed([{ id: "all", label: "All topics" }]));
    return () => ctrl.abort();
  }, [subjectSlug, moduleSlug]);

  return topicOptionsFixed;
}
