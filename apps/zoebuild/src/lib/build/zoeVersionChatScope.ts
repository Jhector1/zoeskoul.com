import {activeSavedHistoryVersion} from "./activeSavedHistoryVersion";

export type ZoeVersionChatScope = Readonly<{sourceVersion:number;savedVersion:number}>;
const integer = (v:unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) < 1_000_000_000;

export function decodeZoeVersionChatScope(value:unknown): ZoeVersionChatScope|null {
  if (!value || typeof value!=="object" || Array.isArray(value)) return null;
  const {sourceVersion,savedVersion}=value as Record<string,unknown>;
  return integer(sourceVersion) && integer(savedVersion) && savedVersion<=sourceVersion
    ? {sourceVersion,savedVersion} : null;
}
export function scopeForCodeProject(currentVersion:number, meta:unknown):ZoeVersionChatScope {
  return {sourceVersion:currentVersion,savedVersion:activeSavedHistoryVersion(currentVersion,meta)};
}
export function matchingZoeVersionScope(a:ZoeVersionChatScope|null,b:ZoeVersionChatScope|null):boolean {
  return !!a && !!b && a.sourceVersion===b.sourceVersion && a.savedVersion===b.savedVersion;
}
