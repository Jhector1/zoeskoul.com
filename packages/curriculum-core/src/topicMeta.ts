export type TopicPoolItem = {
  key: string;
  w: number;
  kind?: string;
  purpose?: "quiz" | "project";
};

export type TopicDefInput = {
  id: string;
  order?: number;
  variant?: string | null;
  titleKey?: string;
  description?: string | null;
  meta: {
    label: string;
    minutes: number;
    pool?: readonly TopicPoolItem[];
  };
};

export function makeTopicDef<T extends { key: string; w: number; kind?: any; purpose?: any }>(args: {
  id: string;
  label: string;
  minutes: number;
  pool?: readonly T[];
  variant?: string | null;
  titleKey?: string;
  description?: string | null;
}): TopicDefInput {
  return {
    id: args.id,
    variant: args.variant,
    titleKey: args.titleKey,
    description: args.description,
    meta: {
      label: args.label,
      minutes: args.minutes,
      pool: args.pool?.map((p) => ({
        key: p.key,
        w: p.w,
        kind: p.kind,
        purpose: p.purpose
      }))
    }
  };
}
