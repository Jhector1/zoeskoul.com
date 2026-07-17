export function makeSketchCard(args: any) {
  return {
    type: "sketch",
    id: `${args.topicId}_s${args.index}`,
    title: args.title,
    sketchId: args.sketchId,
    spec: args.spec,
    height: args.height,
    props: args.props,
    tools: args.tools,
  };
}

export function makeQuizSpec(args: any) {
  return {
    subject: args.subject,
    module: args.module,
    section: args.section,
    topic: args.topic,
    difficulty: args.difficulty ?? "easy",
    n: args.n ?? 3,
    exerciseKeys: Array.isArray(args.exerciseKeys) ? args.exerciseKeys : undefined,
    min: args.min,
    max: args.max,
    selectionMode: args.selectionMode ?? "fixed",
    allowReveal: args.allowReveal ?? true,
    preferKind: args.preferKind ?? null,
    maxAttempts: args.maxAttempts,
    runtime: args.runtime ?? null,
  };
}

export function makeQuizCard(args: any) {
  return {
    type: "quiz",
    id: `${args.topicId}_q${args.index}`,
    title: args.title,
    passScore: args.passScore ?? 0.75,
    spec: args.spec,
    tools: args.tools,
  };
}

export function makeProjectStep(args: any) {
  return {
    id: args.id,
    title: args.title,
    topic: args.topic,
    difficulty: args.difficulty,
    preferKind: args.preferKind ?? null,
    exerciseKey: args.exerciseKey,
    seedPolicy: args.seedPolicy,
    maxAttempts: args.maxAttempts,
    carryFromPrev: args.carryFromPrev,
  };
}

export function makeProjectSpec(args: any) {
  return {
    mode: "project",
    subject: args.subject,
    module: args.module,
    section: args.section,
    topic: args.topic,
    difficulty: args.difficulty ?? "easy",
    preferKind: args.preferKind ?? null,
    allowReveal: args.allowReveal ?? true,
    maxAttempts: args.maxAttempts,
    steps: args.steps,
    runtime: args.runtime ?? null,
    tryIt: args.tryIt,
    displayKind: args.displayKind,
    uiKind: args.uiKind,
  };
}

export function makeProjectCard(args: any) {
  return {
    type: "project",
    id: args.id ?? `${args.topicId}_p${args.index}`,
    title: args.title,
    passScore: args.passScore ?? 0.75,
    tryIt: args.tryIt,
    spec: args.spec,
    tools: args.tools,
  };
}
