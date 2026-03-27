import type {
    RunEvent,
    RunEventInput,
    RunSessionSummary,
} from "@zoeskoul/code-contracts";
// import type { ChildProcessWithoutNullStreams } from "node:child_process";
// // import {RunEventInput} from "@zoeskoul/code-contracts";
//
import {ChildProcessWithoutNullStreams} from "child_process";

type SessionRuntime = {
    proc?: ChildProcessWithoutNullStreams;
    cwd?: string;
    nextSeq: number;
};
//
// import {RunEvent, RunSessionSummary} from "@/lib/code/types/session";

type SessionRecord = RunSessionSummary & {
    actorKey: string;
    workspaceDir?: string;
    events: RunEvent[];
    runtime: SessionRuntime;
};
//
const sessions = new Map<string, SessionRecord>();
//
// export function createSession(record: Omit<SessionRecord, "runtime">) {
//     const full: SessionRecord = {
//         ...record,
//         runtime: {
//             nextSeq: 1,
//         },
//     };
//     sessions.set(full.id, full);
//     return full;
// }

export function getSession(id: string) {
    return sessions.get(id) ?? null;
}
//
// export function patchSession(id: string, patch: Partial<SessionRecord>) {
//     const cur = sessions.get(id);
//     if (!cur) return null;
//
//     const next: SessionRecord = {
//         ...cur,
//         ...patch,
//         runtime: {
//             ...cur.runtime,
//             ...(patch.runtime ?? {}),
//         },
//         updatedAt: new Date().toISOString(),
//     };
//
//     sessions.set(id, next);
//     return next;
// }
//
// export function pushEvent(
//     id: string,
//     event: RunEventInput,
// ) {
//     const cur = sessions.get(id);
//     if (!cur) return null;
//
//     const full: RunEvent = {
//         ...event,
//         seq: cur.runtime.nextSeq++,
//         ts: new Date().toISOString(),
//     } as RunEvent;
//
//     cur.events.push(full);
//     cur.updatedAt = new Date().toISOString();
//     sessions.set(id, cur);
//     return full;
// }
//
// export function attachProcess(
//     id: string,
//     proc: ChildProcessWithoutNullStreams,
// ) {
//     const cur = sessions.get(id);
//     if (!cur) return null;
//     cur.runtime.proc = proc;
//     cur.updatedAt = new Date().toISOString();
//     sessions.set(id, cur);
//     return cur;
// }
//
// export function writeToSession(id: string, input: string) {
//     const cur = sessions.get(id);
//     if (!cur?.runtime.proc || cur.runtime.proc.killed) return false;
//     cur.runtime.proc.stdin.write(input);
//     cur.updatedAt = new Date().toISOString();
//     sessions.set(id, cur);
//     return true;
// }
//
// export function killSessionProcess(id: string) {
//     const cur = sessions.get(id);
//     if (!cur?.runtime.proc || cur.runtime.proc.killed) return false;
//     cur.runtime.proc.kill("SIGKILL");
//     cur.updatedAt = new Date().toISOString();
//     sessions.set(id, cur);
//     return true;
// }