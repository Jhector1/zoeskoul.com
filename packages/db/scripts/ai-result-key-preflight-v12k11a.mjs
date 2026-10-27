/** V12K11A: pure structural key readiness; NEVER emits secret material. */
import {Buffer} from "node:buffer";
export const KEY_VERSIONS = Object.freeze(["v1", "v2", "v3"]);
export function validResultKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const decoded=Buffer.from(value,"base64");
  return decoded.length===32 && decoded.toString("base64")===value;
}
export function inspectResultWriterKeys(input) {
  const active=input.activeId ?? "v1";
  const configured=KEY_VERSIONS.filter(version=>typeof input[version]==="string"&&input[version].length>0);
  const known=KEY_VERSIONS.includes(active);
  const allValid=configured.every(version=>validResultKey(input[version]));
  const unique=configured.every((v,i)=>configured.slice(i+1).every(w=>input[v]!==input[w]));
  const retained=!(input.v2 && !input.v1 && !input.v3);
  return Object.freeze({
    activeVersion:known?active:"invalid",
    configuredVersions:Object.freeze([...configured]),
    activePresent:known && configured.includes(active),
    valid:known && configured.includes(active) && allValid && unique && retained,
  });
}
