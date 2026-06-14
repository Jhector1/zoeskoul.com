/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:topic-manifests

import type {
  SlimTopicManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";

import whatTheTerminalIsJson from "./modules/module1/topics/what-the-terminal-is/topic.bundle.json";
import whereAmIJson from "./modules/module1/topics/where-am-i/topic.bundle.json";
import movingAroundJson from "./modules/module1/topics/moving-around/topic.bundle.json";
import module1TerminalMapProjectJson from "./modules/module1/topics/module-1-terminal-map-project/topic.bundle.json";
import creatingFoldersAndFilesJson from "./modules/module2/topics/creating-folders-and-files/topic.bundle.json";
import copyMoveRenameJson from "./modules/module2/topics/copy-move-rename/topic.bundle.json";
import viewingFileContentsJson from "./modules/module2/topics/viewing-file-contents/topic.bundle.json";
import module2NotesOrganizerProjectJson from "./modules/module2/topics/module-2-notes-organizer-project/topic.bundle.json";


const whatTheTerminalIs = whatTheTerminalIsJson as SlimTopicManifest;
const whereAmI = whereAmIJson as SlimTopicManifest;
const movingAround = movingAroundJson as SlimTopicManifest;
const module1TerminalMapProject = module1TerminalMapProjectJson as SlimTopicManifest;
const creatingFoldersAndFiles = creatingFoldersAndFilesJson as SlimTopicManifest;
const copyMoveRename = copyMoveRenameJson as SlimTopicManifest;
const viewingFileContents = viewingFileContentsJson as SlimTopicManifest;
const module2NotesOrganizerProject = module2NotesOrganizerProjectJson as SlimTopicManifest;

export const TOPIC_MANIFESTS: TopicManifestRefMap = {
  "what-the-terminal-is": whatTheTerminalIs,
  "where-am-i": whereAmI,
  "moving-around": movingAround,
  "module-1-terminal-map-project": module1TerminalMapProject,
  "creating-folders-and-files": creatingFoldersAndFiles,
  "copy-move-rename": copyMoveRename,
  "viewing-file-contents": viewingFileContents,
  "module-2-notes-organizer-project": module2NotesOrganizerProject,
};
