import type {
    ReviewCard,
    ReviewProjectSpec,
    ReviewQuizSpec,
    ReviewProjectStep,
} from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

type Difficulty = "easy" | "medium" | "hard";

export function makeTextCard(args: {
    topicId: string;
    index: number;
    title?: string;
    markdown: string;
    spec?: any;
}): Extract<ReviewCard, { type: "text" }> {
    return {
        type: "text",
        id: `${args.topicId}_t${args.index}`,
        title: args.title,
        markdown: args.markdown,
        spec: args.spec,
    };
}

export function makeSketchCard(args: {
    topicId: string;
    index: number;
    title?: string;
    sketchId: string;
    spec?: any;
    height?: number;
    props?: any;
}): Extract<ReviewCard, { type: "sketch" }> {
    return {
        type: "sketch",
        id: `${args.topicId}_s${args.index}`,
        title: args.title,
        sketchId: args.sketchId,
        spec: args.spec,
        height: args.height,
        props: args.props,
    };
}

export function makeQuizSpec(args: {
    subject: string;
    module?: string;
    section?: string;
    topic?: string;
    difficulty?: Difficulty;
    n?: number;
    allowReveal?: boolean;
    preferKind?: PracticeKind | null;
    maxAttempts?: number;
}): ReviewQuizSpec {
    return {
        subject: args.subject,
        module: args.module,
        section: args.section,
        topic: args.topic,
        difficulty: args.difficulty ?? "easy",
        n: args.n ?? 3,
        allowReveal: args.allowReveal ?? true,
        preferKind: args.preferKind ?? null,
        maxAttempts: args.maxAttempts ?? 10,
    };
}

export function makeQuizCard(args: {
    topicId: string;
    index: number;
    title?: string;
    passScore?: number;
    spec: ReviewQuizSpec;
}): Extract<ReviewCard, { type: "quiz" }> {
    return {
        type: "quiz",
        id: `${args.topicId}_q${args.index}`,
        title: args.title,
        passScore: args.passScore ?? 0.75,
        spec: args.spec,
    };
}

export function makeProjectStep(args: {
    id: string;
    title?: string;
    topic?: string;
    difficulty?: Difficulty;
    preferKind?: PracticeKind | null;
    exerciseKey?: string;
    seedPolicy?: "actor" | "global";
    maxAttempts?: number;
    carryFromPrev?: boolean;
}): ReviewProjectStep {
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

export function makeProjectSpec(args: {
    subject: string;
    module?: string;
    section?: string;
    topic?: string;
    difficulty?: Difficulty;
    preferKind?: PracticeKind | null;
    allowReveal?: boolean;
    maxAttempts?: number;
    steps: ReviewProjectStep[];
}): ReviewProjectSpec {
    return {
        mode: "project",
        subject: args.subject,
        module: args.module,
        section: args.section,
        topic: args.topic,
        difficulty: args.difficulty ?? "easy",
        preferKind: args.preferKind ?? null,
        allowReveal: args.allowReveal ?? true,
        maxAttempts: args.maxAttempts ?? 10,
        steps: args.steps,
    };
}

export function makeProjectCard(args: {
    topicId: string;
    index: number;
    title?: string;
    passScore?: number;
    spec: ReviewProjectSpec;
}): Extract<ReviewCard, { type: "project" }> {
    return {
        type: "project",
        id: `${args.topicId}_p${args.index}`,
        title: args.title,
        passScore: args.passScore ?? 0.75,
        spec: args.spec,
    };
}

export function makeVideoCard(args: {
    topicId: string;
    index: number;
    title?: string;
    url: string;
    provider?: "auto" | "youtube" | "vimeo" | "iframe" | "file";
    startSeconds?: number;
    posterUrl?: string;
    captionMarkdown?: string;
    spec?: any;
}): Extract<ReviewCard, { type: "video" }> {
    return {
        type: "video",
        id: `${args.topicId}_v${args.index}`,
        title: args.title,
        url: args.url,
        provider: args.provider,
        startSeconds: args.startSeconds,
        posterUrl: args.posterUrl,
        captionMarkdown: args.captionMarkdown,
        spec: args.spec,
    };
}