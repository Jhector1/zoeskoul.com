// "use client";

import React from "react";
import type { Exercise, SubmitAnswer } from "@/lib/practice/types";
import type { QItem, MissedItem } from "@/components/practice/practiceType";

// function exerciseFromMissed(m: MissedItem): Exercise {
//   // reconstruct the minimum Exercise shape your UIs expect
//   return {
//     kind: m.kind as any,
//     title: m.title,
//     prompt: m.prompt,
//     topic: m.topic as any,
//     ...(m.publicPayload ?? {}),
//   } as any;
// }
//
// function qItemFromMissed(m: MissedItem): QItem {
//   const ua: SubmitAnswer | any = m.userAnswer ?? {};
//   const q: any = {
//     key: m.id,
//     submitted: true,
//     revealed: true, // summary mode
//     attempts: 999,
//     result: {
//       ok: false,
//       expected: m.expected,
//       explanation: m.explanation ?? null,
//       finalized: true,
//     },
//   };
//
//   // map SubmitAnswer -> QItem fields used by your UIs
//   switch (m.kind) {
//     case "numeric":
//       q.num = ua.value ?? ua.num ?? "";
//       break;
//
//     case "single_choice":
//       q.single = ua.id ?? ua.choiceId ?? ua.value ?? "";
//       break;
//
//     case "multi_choice":
//       q.multi = ua.ids ?? ua.values ?? ua.selected ?? [];
//       break;
//
//     case "matrix_input": {
//       const values = ua.values ?? ua.mat ?? ua.matrix ?? [];
//       q.mat = values;
//       q.matRows = Array.isArray(values) ? values.length : 0;
//       q.matCols = Array.isArray(values?.[0]) ? values[0].length : 0;
//       break;
//     }
//
//     case "vector_drag_dot":
//       q.dragA = ua.a ?? { x: 0, y: 0, z: 0 };
//       break;
//
//     case "vector_drag_target":
//       q.dragA = ua.a ?? { x: 0, y: 0, z: 0 };
//       q.dragB = ua.b ?? { x: 0, y: 0, z: 0 };
//       break;
//
//     case "code_input":
//       q.code = ua.code ?? "";
//       q.codeStdin = ua.stdin ?? "";
//       q.codeLang = ua.language ?? ua.lang ?? "python";
//       break;
//   }
//
//   // attach reconstructed exercise
//   q.exercise = exerciseFromMissed(m);
//   return q as QItem;
// }
//
// type Props = {
//   // mode metadata
//   sessionId?: string | null;
//   isAssignmentRun?: boolean;
//
//   // filters
//   topic?: string | null;
//   difficulty?: "easy" | "medium" | "hard" | string;
//
//   // progress
//   index?: number; // 0-based
//   total?: number;
//   attempts?: number;
//   maxAttempts?: number;
//
//   // status
//   loading?: boolean;
//   submitting?: boolean;
//   allowReveal?: boolean;
// };
//
// function Pill({
//   children,
//   tone = "neutral",
// }: {
//   children: React.ReactNode;
//   tone?: "neutral" | "good" | "warn";
// }) {
//   const cls =
//     tone === "good"
//       ? "border-emerald-400/30 bg-emerald-300/10 text-emerald-100"
//       : tone === "warn"
//         ? "border-amber-400/30 bg-amber-300/10 text-amber-100"
//         : "border-white/10 bg-white/[0.04] text-white/80";
//
//   return (
//     <span
//       className={[
//         "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold",
//         cls,
//       ].join(" ")}
//     >
//       {children}
//     </span>
//   );
// }
// //
// // export default function PracticeSummary({
// //   sessionId,
// //   isAssignmentRun = false,
// //   topic,
// //   difficulty,
// //   index,
// //   total,
// //   attempts,
// //   maxAttempts,
// //   loading,
// //   submitting,
// //   allowReveal,
// // }: Props) {
// //   const modeText = isAssignmentRun
// //     ? "Assignment"
// //     : sessionId
// //       ? "Session"
// //       : "Stateless";
// //
// //   const attemptTone =
// //     typeof attempts === "number" && typeof maxAttempts === "number"
// //       ? attempts >= maxAttempts
// //         ? "warn"
// //         : "neutral"
// //       : "neutral";
// //
// //   const busy = Boolean(loading || submitting);
// //
// //   return (
// //     <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
// //       <div className="flex flex-wrap items-start justify-between gap-3">
// //         <div className="min-w-0">
// //           <div className="text-xs font-extrabold text-white/60">Practice</div>
// //           <div className="mt-1 text-base font-extrabold text-white/90">
//             {modeText}
//           </div>
//
//           <div className="mt-2 flex flex-wrap gap-2">
//             <Pill>
//               {difficulty ? `difficulty: ${difficulty}` : "difficulty: —"}
//             </Pill>
//             <Pill>{topic ? `topic: ${topic}` : "topic: all"}</Pill>
//             {allowReveal ? (
//               <Pill tone="good">reveal enabled</Pill>
//             ) : (
//               <Pill>reveal off</Pill>
//             )}
//             {busy ? (
//               <Pill tone="warn">{submitting ? "submitting…" : "loading…"}</Pill>
//             ) : (
//               <Pill tone="good">ready</Pill>
//             )}
//           </div>
//         </div>
//
//         <div className="flex flex-col items-end gap-2">
//           <div className="flex flex-wrap justify-end gap-2">
//             {typeof index === "number" && typeof total === "number" ? (
//               <Pill tone="neutral">
//                 question: {index + 1}/{total}
//               </Pill>
//             ) : (
//               <Pill tone="neutral">question: —</Pill>
//             )}
//
//             {typeof attempts === "number" ? (
//               <Pill tone={attemptTone as any}>
//                 attempts: {attempts}
//                 {typeof maxAttempts === "number" ? `/${maxAttempts}` : ""}
//               </Pill>
//             ) : (
//               <Pill>attempts: —</Pill>
//             )}
//           </div>
//
//           {sessionId ? (
//             <div className="text-[11px] font-mono text-white/45">
//               session: {String(sessionId).slice(0, 10)}…
//             </div>
//           ) : (
//             <div className="text-[11px] text-white/35">no session id</div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }
//
// // import type { TopicSlug } from "@/lib/practice/types";
// import MathMarkdown from "../markdown/MathMarkdown";
// import { VectorPadState } from "../vectorpad/types";
// import ExerciseRenderer from "./ExerciseRenderer";
// import MissedPracticeCard from "./MissedPracticeCard";
//
// // export type MissedItem = {
// //   id: string;
// //   at: number;
// //   topic: TopicSlug;
//   kind: string;
//   title: string;
//     publicPayload?: any;

//   prompt: string;
//   userAnswer: any;
//   expected: any;
//   explanation?: string | null;
// };

// export  function PracticeSummaryCard({
//   missed,
//   tCards,
// }: {
//   missed: MissedItem[];
//   tCards: (key: string, vars?: Record<string, any>) => string;
// }) {
//   return (
//     <div className="p-4 grid gap-3">
//       <div className="text-xs text-white/70 font-extrabold">
//         {tCards("missedLabel", { count: missed.length })}
//       </div>

//       {missed.map((m) => (
//         <div
//           key={m.id}
//           className="rounded-2xl border border-white/10 bg-black/20 p-4"
//         >
//           <div className="flex items-start justify-between gap-3">
//             <div>
//               <div className="text-sm font-black break-words">{m.title}</div>
//               <div className="mt-1 text-xs text-white/70 whitespace-pre-wrap break-words">
//                 {/* {m.prompt} */}
//                 <MathMarkdown content={m.prompt} />
//               </div>
//             </div>

//             <div className="rounded-full border border-rose-300/20 bg-rose-300/10 px-2 py-1 text-[11px] font-extrabold text-white/80">
//               {String(m.topic).toUpperCase()} •{" "}
//               {m.kind.replaceAll("_", " ")}
//             </div>
//           </div>

//           <div className="mt-3 grid gap-2 text-xs">
//             <div className="rounded-xl border border-white/10 bg-white/5 p-3">
//               <div className="text-white/60 font-extrabold">
//                 {tCards("yourAnswer")}
//               </div>
//               <pre className="mt-1 text-white/85 whitespace-pre-wrap break-words">
//                 {JSON.stringify(m.userAnswer, null, 2)}
//               </pre>
//             </div>

//             <div className="rounded-xl border border-white/10 bg-white/5 p-3">
//               <div className="text-white/60 font-extrabold">
//                 {tCards("expected")}
//               </div>
//               <pre className="mt-1 text-white/85 whitespace-pre-wrap break-words">
//                 {JSON.stringify(m.expected, null, 2)}
//               </pre>
//             </div>

//             {m.explanation ? (
//               <div className="rounded-xl border border-white/10 bg-white/5 p-3">
//                 <div className="text-white/60 font-extrabold">
//                   {tCards("explanation")}
//                 </div>
//                 <div className="mt-1 text-white/85 whitespace-pre-wrap break-words">
//                   {m.explanation}
//                 </div>
//               </div>
//             ) : null}
//           </div>
//         </div>
//       ))}
//     </div>
//   );
// }
// export function PracticeSummaryCard({
//   missed,
//   tCards,
//   padRef,
// }: {
//   missed: MissedItem[];
//   tCards: (key: string, vars?: Record<string, any>) => string;
//   padRef: React.MutableRefObject<VectorPadState>;
// }) {
//   return (
//     <div className="p-4 grid gap-3">
//       <div className="text-xs text-white/70 font-extrabold">
//         {tCards("missedLabel", { count: missed.length })}
//       </div>
//
//       {Array.isArray(missed) && missed.length > 0 ? (
//         <div className="mt-4 grid gap-3">
//           {missed.map((m) => (
//             <MissedPracticeCard key={m.id} missed={m} />
//           ))}
//         </div>
//       ) : null}
//       <></>
//       {missed.map((m) => {
//         const q = qItemFromMissed(m);
//         const ex = (q as any).exercise as Exercise;
//
//         return (
//           <div
//             key={m.id}
//             className="rounded-2xl border border-white/10 bg-black/20 p-4"
//           >
//             <ExerciseRenderer
//               exercise={ex}
//               current={q}
//               busy={false}
//               isAssignmentRun={true}
//               maxAttempts={0}
//               padRef={padRef}
//               updateCurrent={() => {}}
//               readOnly
//             />
//
//             {/* ✅ show expected / explanation beneath (since ExerciseRenderer doesn’t show expected) */}
//             <div className="mt-3 grid gap-2 text-xs">
//               <div className="rounded-xl border border-white/10 bg-white/5 p-3">
//                 <div className="text-white/60 font-extrabold">
//                   {tCards("expected")}
//                 </div>
//                 <pre className="mt-1 text-white/85 whitespace-pre-wrap break-words">
//                   {JSON.stringify(m.expected, null, 2)}
//                 </pre>
//               </div>
//
//               {m.explanation ? (
//                 <div className="rounded-xl border border-white/10 bg-white/5 p-3">
//                   <div className="text-white/60 font-extrabold">
//                     {tCards("explanation")}
//                   </div>
//                   <div className="mt-1 text-white/85 whitespace-pre-wrap break-words">
//                     {m.explanation}
//                   </div>
//                 </div>
//               ) : null}
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }
