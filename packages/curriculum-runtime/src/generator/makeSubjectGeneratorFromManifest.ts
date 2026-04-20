import type {
    SubjectManifest,
    TopicManifestRefMap,
} from "@zoeskoul/curriculum-contracts";
import { buildGeneratorTopicsForModule } from "./buildGeneratorTopicsForModule.js";
import { resolveModuleFromTopicSlug } from "./resolveModuleFromTopicSlug.js";

export type TopicContext = {
    topicSlug?: string | null;
};

export type SubjectModuleGenerator = {
    engineName: string;
    defaultPurpose: "quiz" | "project";
    enablePurpose: boolean;
    topics: ReturnType<typeof buildGeneratorTopicsForModule>;
};

export function makeSubjectGeneratorFromManifest(args: {
    manifest: SubjectManifest;
    topicManifests: TopicManifestRefMap;
    ctx: TopicContext;
    profileId: string;
}): SubjectModuleGenerator {
    const { manifest, topicManifests, ctx, profileId } = args;

    const rawTopicSlug = String(ctx.topicSlug ?? "");
    const moduleSlug = resolveModuleFromTopicSlug({
        manifest,
        topicSlug: rawTopicSlug,
    });

    if (!moduleSlug) {
        return {
            engineName: `${manifest.subject.genKey}_none`,
            defaultPurpose: "quiz",
            enablePurpose: true,
            topics: [],
        };
    }

    const topics = buildGeneratorTopicsForModule({
        manifest,
        topicManifests,
        moduleSlug,
        profileId,
    });

    return {
        engineName: `${manifest.subject.genKey}_${moduleSlug}`,
        defaultPurpose: "quiz",
        enablePurpose: true,
        topics,
    };
}