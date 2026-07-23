/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:topic-manifests

import type {
  SlimTopicManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";

import recursiveBooleanConfigurationsJson from "./modules/module1/topics/recursive-boolean-configurations/topic.bundle.json";
import detectEqualPairSumsJson from "./modules/module1/topics/detect-equal-pair-sums/topic.bundle.json";
import buildAndRebalanceBstsJson from "./modules/module1/topics/build-and-rebalance-bsts/topic.bundle.json";
import priorityQueueWithStacksJson from "./modules/module1/topics/priority-queue-with-stacks/topic.bundle.json";
import insertLinkedBinaryHeapJson from "./modules/module1/topics/insert-linked-binary-heap/topic.bundle.json";


const recursiveBooleanConfigurations = recursiveBooleanConfigurationsJson as SlimTopicManifest;
const detectEqualPairSums = detectEqualPairSumsJson as SlimTopicManifest;
const buildAndRebalanceBsts = buildAndRebalanceBstsJson as SlimTopicManifest;
const priorityQueueWithStacks = priorityQueueWithStacksJson as SlimTopicManifest;
const insertLinkedBinaryHeap = insertLinkedBinaryHeapJson as SlimTopicManifest;

export const TOPIC_MANIFESTS: TopicManifestRefMap = {
  "recursive-boolean-configurations": recursiveBooleanConfigurations,
  "detect-equal-pair-sums": detectEqualPairSums,
  "build-and-rebalance-bsts": buildAndRebalanceBsts,
  "priority-queue-with-stacks": priorityQueueWithStacks,
  "insert-linked-binary-heap": insertLinkedBinaryHeap,
};
