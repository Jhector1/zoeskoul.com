import type { ReviewQuizSpec } from "@/lib/subjects/types";

// src/lib/review/clientApi.ts
// import type { ReviewQuizSpec } from "@/lib/review/types";

export async function fetchReviewQuiz(spec: ReviewQuizSpec, signal?: AbortSignal) {
  const res = await fetch("/api/review/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
    signal,
    cache: "no-store",
  });

  const text = await res.text();

  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.message ?? "Failed to load quiz.");

  // ✅ server returns quizKey too
  return json as { questions: any[]; quizKey: string };
}



// // src/lib/practice/clientApi.ts
// export type PracticeGetResponse = any;
//
// async function readJsonSafe(res: Response) {
//   const text = await res.text();
//   if (!text) throw new Error(`Empty response body (status ${res.status})`);
//
//   try {
//     return JSON.parse(text);
//   } catch {
//     // surface the URL + status to debug 404s instantly
//     throw new Error(`Non-JSON response (status ${res.status}): ${text.slice(0, 200)}`);
//   }
// }
//
// export async function fetchPracticeExercise(args: {
//   subject?: string;
//   module?: string;
//   topic?: string;
//   difficulty?: string;
//   section?: string;
//   allowReveal?: boolean;
//   sessionId?: string;
//   signal?: AbortSignal;
//   preferKind?: string;
//   genKey?: string;
//
//   // ✅ NEW: stable salt (used by review quiz to freeze exercises)
//   salt?: string;
// }) {
//   function practiceUrlFromFetch(fetchObj: any) {
//     const sp = new URLSearchParams();
//
//     sp.set("subject", fetchObj.subject);
//     if (fetchObj.module) sp.set("module", fetchObj.module);
//     if (fetchObj.section) sp.set("section", fetchObj.section);
//     if (fetchObj.topic) sp.set("topic", fetchObj.topic);
//     if (fetchObj.subject) qs.set("subject", fetchObj.subject);
//
//     if (fetchObj.difficulty) sp.set("difficulty", fetchObj.difficulty);
//     // if (fetchObj.allowReveal) qs.set("allowReveal", "true");
//     if (fetchObj.genKey) qs.set("genKey", fetchObj.genKey);
//     sp.set("allowReveal", fetchObj.allowReveal ? "true" : "false");
//     if (fetchObj.preferKind) sp.set("preferKind", fetchObj.preferKind);
//
//     // ✅ THESE THREE ARE REQUIRED FOR PROJECT DETERMINISM
//     if (fetchObj.salt) sp.set("salt", fetchObj.salt);
//     if (fetchObj.exerciseKey) sp.set("exerciseKey", fetchObj.exerciseKey);
//     if (fetchObj.seedPolicy) sp.set("seedPolicy", fetchObj.seedPolicy);
//
//     return `/api/practice?${sp.toString()}`;
//   }
//
//   const qs = new URLSearchParams();
//   if (args.subject) qs.set("subject", args.subject);
//   if (args.module) qs.set("module", args.module);
//   if (args.topic) qs.set("topic", args.topic);
//   if (args.difficulty) qs.set("difficulty", args.difficulty);
//   if (args.section) qs.set("section", args.section);
//   if (args.allowReveal) qs.set("allowReveal", "true");
//   if (args.sessionId) qs.set("sessionId", args.sessionId);
//   if (args.preferKind) qs.set("preferKind", args.preferKind);
//   if (args.genKey) qs.set("genKey", args.genKey);
//
//   // ✅ ADD THIS
//   if (args.salt) qs.set("salt", args.salt);
//
//   const res = await fetch(`/api/practice?${qs.toString()}`, {
//     method: "GET",
//     cache: "no-store",
//     signal: args.signal,
//   });
//
//   const data = await readJsonSafe(res);
//   if (!res.ok) throw new Error(data?.explanation ?? data?.message ?? `Failed (${res.status})`);
//   return data as PracticeGetResponse;
// }
//
// export async function submitPracticeAnswer(args: {
//   key: string;
//   answer?: any;
//   reveal?: boolean;
//   signal?: AbortSignal;
// }) {
//   // ✅ IMPORTANT: leading slash so it does NOT become /en/practice/api/...
//   const res = await fetch(`/api/practice/validate`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     cache: "no-store",
//     signal: args.signal,
//     body: JSON.stringify({
//       key: args.key,
//       reveal: args.reveal ? true : undefined,
//       answer: args.reveal ? undefined : args.answer,
//     }),
//   });
//
//   const data = await readJsonSafe(res);
//   if (!res.ok) throw new Error(data?.explanation ?? data?.message ?? `Failed (${res.status})`);
//   return data;
// }
