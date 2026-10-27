"use client";

import Link from "next/link";

import {
  ProjectCodeIcon,
  ProjectPreviewIcon,
} from "@/components/builder/ProjectTopbarIcons";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { ZoeBuildMode } from "@/components/builder/ZoeBuildModeTabs";

import {
  ZoeBuildPromptComposer,
  type ZoeBuildPromptSubmission,
} from "@/components/builder/ZoeBuildPromptComposer";

import type {
  ShopifyImportDraft,
} from "@/lib/import/shopify";

import {
  formatZoeBuildPlan,
  requestZoeBuildPlan,
} from "@/lib/build/requestZoeBuildPlan";

import WebPreview from "@zoeskoul/learner-workspace/runner/components/WebPreview";
import type {
  WebPreviewCommerceRequest,
} from "@zoeskoul/learner-workspace/runner/components/WebPreview";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";

import BuildWorkspaceClient from "./BuildWorkspaceClient";
import ProjectRevisionHistory from "./ProjectRevisionHistory";
import SiteSettingsWorkspacePanel, { type Section as SiteSettingsSection } from "./SiteSettingsWorkspacePanel";
import { resolveZoeSelectedProvider } from "@/lib/build/zoeAssistantServiceIntent";
import type { ZoeSourceEditProposal } from "@/lib/build/zoeTargetedSourceEdit";
import StripeCheckoutReturnNotice from "./StripeCheckoutReturnNotice";
import ZoeThinkingPanel, {type ZoeThinkingPhase} from "./ZoeThinkingPanel";
import {readZoeEditEventStream} from "@/lib/build/zoeEditEventStream";
import {isAiCreditShortage,isAiCreditShortageCode,ZoeAiCreditShortageError} from "@/lib/billing/creditShortage";
import { ZOE_AI_OPERATION_HEADER } from "@/lib/build/aiBillingOperationIdentity";
import { getOrCreateAiBrowserAttempt, completeAiBrowserAttempt } from "@/lib/build/aiBrowserAttemptRecovery";
import { ZOEBUILD_SESSION_EXPIRED_EVENT, ZOEBUILD_SESSION_RENEWED_EVENT } from "@/lib/auth/useBuilderSessionContinuity";
import type { ZoeSemanticIntent } from "@/lib/build/zoeSemanticIntent";
import { PublishProjectButton } from "@/components/builder/PublishProjectButton";
import { useReactVitePreview } from "@/components/builder/useReactVitePreview";
import { PersistentReactPreviewSlot } from "@/components/builder/PersistentReactPreviewHost";
import { fetchAuthoritativeAppliedProject } from "@/lib/build/fetchAuthoritativeAppliedProject";
import { verifyAppliedZoeSource } from "@/lib/build/verifyAppliedZoeSource";
import actionStyles from "./ZoeAssistantActions.module.css";
import ZoeAssistantMessage from "./ZoeAssistantMessage";
import { makeZoeChatTurn, type ZoeChatTurn } from "@/lib/build/zoeChatTurns";
import { serializeZoeConversationHistory } from "@/lib/build/zoeConversationContext";
import { mergeZoeChatHistory, readZoeChatHistoryPayload } from "@/lib/build/zoeChatHistoryClient";
import {keepReviewedProposal, recoverReviewedProposal, clearReviewedProposal} from "@/lib/build/zoeReviewedProposalSessionV12K11N";
import { readZoeAnswerEventStream } from "@/lib/build/zoeAnswerEventStream";
import { resolveZoeChatFollowState } from "@/lib/build/zoeChatAutoFollow";

const AI_EDIT_ACCESS_MESSAGE = "AI editing permission is not active for this account. Open ZoeBuild Billing → AI credit balance to check your feature grant. No project source was changed.";

type BuildWorkspaceProps =
  Parameters<
    typeof BuildWorkspaceClient
  >[0];

export default function ProjectBuilderShell(props: {
  locale: string;
  project:
    BuildWorkspaceProps["project"];

  initialDeployment?:
    Parameters<
      typeof PublishProjectButton
    >[0]["initialDeployment"];
}) {
  const [mode, setMode] =
    useState<ZoeBuildMode>("preview");

  const [settingsOpen, setSettingsOpen] =
    useState(false);
  const [shopifyConnectedReturn, setShopifyConnectedReturn] = useState(false);
  const [assistantSettingsSection, setAssistantSettingsSection] = useState<SiteSettingsSection | undefined>();
  const [assistantNavigationVersion, setAssistantNavigationVersion] = useState(0);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shopify") === "connected") {
      setShopifyConnectedReturn(true);
      setSettingsOpen(true);
    }
  }, []);

  const [previewWorkspace, setPreviewWorkspace] =
    useState(props.project.workspace);
  const [previewSourceVersion, setPreviewSourceVersion] =
    useState(props.project.sourceVersion);
  const [codeDirty, setCodeDirty] =
    useState(false);
  // This ref is updated synchronously from editor events so in-flight AI saves
  // cannot discard manual work using an out-of-date async state closure.
  const codeDirtyRef = useRef(false);

  // Keep the editor and preview in sync with the canonical saved source after
  // an AI apply, without remounting the Zoé conversation or entire page.
  const [editorProject, setEditorProject] = useState(props.project);
  const [editorHydrationEpoch, setEditorHydrationEpoch] = useState(0);


  const reactPreviewEnabled =
    props.project.stackId === "react-vite-v1";

  const reactPreview = useReactVitePreview({
    enabled: reactPreviewEnabled,
    buildProjectId: props.project.buildProjectId,
    sourceVersion: previewSourceVersion,
    workspace: previewWorkspace,
    allowDependencyBootstrap: !codeDirty,
  });

  const previewEntries = exportWorkspaceEntries(previewWorkspace.nodes);

  const [
    commerceCandidate,
    setCommerceCandidate,
  ] =
    useState<string | null>(
      null,
    );

  const [messages, setMessages] =
    useState<ZoeChatTurn[]>([]);
  // Follow new conversation turns and typed answer growth only while the reader
  // is at the bottom. This scrolls the thread, never the page or preview.
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const chatFollowRef = useRef(true);
  // Layout and automatic scroll events must not be mistaken for reader intent.
  const chatScrollIntentRef = useRef<"up" | "down" | null>(null);
  const chatTouchYRef = useRef<number | null>(null);
  const chatScrollbarDragYRef = useRef<number | null>(null);
  const chatScrollFrameRef = useRef<number | null>(null);

  function noteZoeReaderScroll(direction: "up" | "down") {
    chatScrollIntentRef.current = direction;
    if (direction === "up") chatFollowRef.current = false;
  }

  function scrollZoeChatToBottom() {
    const thread = chatThreadRef.current;
    if (thread && chatFollowRef.current) thread.scrollTop = thread.scrollHeight;
  }

  function onZoeChatThreadScroll() {
    const thread = chatThreadRef.current;
    if (!thread) return;
    // Text typing / syntax highlighting can grow scrollHeight before the next
    // animation frame. An onScroll from browser scroll anchoring is NOT a user
    // request to stop following: only explicit up gestures suspend following.
    chatFollowRef.current = resolveZoeChatFollowState({
      scrollHeight: thread.scrollHeight,
      scrollTop: thread.scrollTop,
      clientHeight: thread.clientHeight,
    }, chatFollowRef.current, chatScrollIntentRef.current);
  }

  useEffect(() => {
    const thread = chatThreadRef.current;
    if (!thread || typeof MutationObserver === "undefined") return;
    const scheduleFollow = () => {
      if (!chatFollowRef.current || chatScrollFrameRef.current !== null) return;
      chatScrollFrameRef.current = window.requestAnimationFrame(() => {
        chatScrollFrameRef.current = null;
        scrollZoeChatToBottom();
      });
    };
    // The assistant's typewriter changes DOM text, not the parent messages list.
    // Observe those updates so the response stays visible as it expands.
    const observer = new MutationObserver(scheduleFollow);
    observer.observe(thread, {childList: true, subtree: true, characterData: true});
    scheduleFollow();
    return () => {
      observer.disconnect();
      if (chatScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(chatScrollFrameRef.current);
        chatScrollFrameRef.current = null;
      }
    };
  }, [props.project.buildProjectId]);

  // Keep a synchronous, project-component-scoped history for exact AI attempts.
  // React state changes are asynchronous; a follow-up can arrive before re-render.
  const chatHistoryRef = useRef<ZoeChatTurn[]>([]);
  const historyLoadRef = useRef<Promise<void> | null>(null);
  const historyWritesRef = useRef<Promise<void>>(Promise.resolve());
  const [chatHistoryError, setChatHistoryError] = useState<string | null>(null);
  const historyUrl = `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/history`;

  function ensureChatHistoryLoaded(): Promise<void> {
    if (historyLoadRef.current) return historyLoadRef.current;
    historyLoadRef.current = (async () => {
      const response = await fetch(historyUrl, {credentials:"same-origin",cache:"no-store"});
      const payload: unknown = await response.json().catch(() => null);
      const restored = readZoeChatHistoryPayload(payload);
      if (!response.ok || !restored) throw new Error("Chat history could not be restored.");
      chatHistoryRef.current = mergeZoeChatHistory(restored,chatHistoryRef.current);
      setMessages(chatHistoryRef.current);
    })().catch(error => {
      setChatHistoryError("Chat history is unavailable. Reload after confirming the chat migration is deployed. No AI request was sent.");
      throw error;
    });
    return historyLoadRef.current;
  }
  useEffect(() => { void ensureChatHistoryLoaded().catch(() => {}); }, [props.project.buildProjectId]);

  function recordChatTurn(role: ZoeChatTurn["role"], text: string) {
    // A new user submission returns the viewport to the live conversation.
    if (role === "user") { chatFollowRef.current = true; chatScrollIntentRef.current = null; }
    const turn: ZoeChatTurn = {...makeZoeChatTurn(role, text), clientTurnId:crypto.randomUUID()};
    chatHistoryRef.current = [...chatHistoryRef.current, turn];
    setMessages(chatHistoryRef.current);
    // Preserve user/assistant ordering within the open session. Failed storage
    // is visible; never pretend chat is durable or retry a billable operation.
    historyWritesRef.current = historyWritesRef.current.catch(() => {}).then(async () => {
      const response = await fetch(historyUrl, {method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(turn)});
      if (!response.ok) throw new Error("Chat turn could not be saved");
    });
    void historyWritesRef.current.catch(() => {
      setChatHistoryError("Zoé answered, but part of this conversation was not saved. Keep this tab open until storage is available.");
    });
  }
  // When a request is paused for unsaved source, preserve its preceding context.
  const deferredHistoryRef = useRef<readonly string[] | null>(null);
  // Never put model replies into the browser's billing-recovery journal.
  // Only in-memory snapshots may accompany a live/repeated logical attempt.
  const requestConversationRef = useRef<{
    operationId: string; history: readonly string[];
  } | null>(null);
  // Keep only the user's latest blocked prompt in memory. No provider call or
  // billable operation ID is created until the local source is saved.
  const deferredAssistantSubmission = useRef<ZoeBuildPromptSubmission | null>(null);
  const [hasDeferredAssistantSubmission, setHasDeferredAssistantSubmission] = useState(false);
  // Synchronous request lock prevents two near-simultaneous Build submissions.
  const assistantRequestInFlight = useRef(false);
  // Logical retries survive a same-tab refresh in short-lived sessionStorage.
  // No prompt, media contents, provider output or financial balance is stored.
  const pendingAiBillingAttempt = useRef<{id:string} | null>(null);
  // Preserve the existing, user-instruction-only journal for unresolved attempts.
  const previousAssistantInstructions = useRef<string[]>([]);
  const [assistantChecking, setAssistantChecking] = useState(false);
  useEffect(() => {
    // Follow layout changes on submitted turns, completed replies, and status.
    scrollZoeChatToBottom();
  }, [messages.length, assistantChecking]);
  const [thinkingPhase, setThinkingPhase] = useState<ZoeThinkingPhase>("checking");
  const [thinkingSummary, setThinkingSummary] = useState("");
  const [assistantAuthNeeded, setAssistantAuthNeeded] = useState(false);
  const AUTHORITY_UNAVAILABLE_MESSAGE = "Zoéskoul session verification is temporarily unavailable. Your session has not been marked expired. Retry after the service recovers; no project source was changed.";
  useEffect(() => {
    const expired = () => setAssistantAuthNeeded(true);
    const renewed = () => setAssistantAuthNeeded(false);
    window.addEventListener(ZOEBUILD_SESSION_EXPIRED_EVENT, expired);
    window.addEventListener(ZOEBUILD_SESSION_RENEWED_EVENT, renewed);
    return () => {
      window.removeEventListener(ZOEBUILD_SESSION_EXPIRED_EVENT, expired);
      window.removeEventListener(ZOEBUILD_SESSION_RENEWED_EVENT, renewed);
    };
  }, []);

  const [
    pendingPlan,
    setPendingPlan,
  ] =
    useState<
      Awaited<
        ReturnType<
          typeof requestZoeBuildPlan
        >
      > |
      null
    >(null);

  // Bind every full-source replacement proposal to the version it was planned for.
  const pendingPlanBaseVersion = useRef<number | null>(null);
  const [pendingFileEdit, setPendingFileEdit] = useState<ZoeSourceEditProposal | null>(null);
  const [reviewRecoveryNotice, setReviewRecoveryNotice] = useState<string | null>(null);
  // Review proposals are browser drafts until an authenticated, verified PATCH
  // has committed. Restore them after a Next.js dev restart or same-tab reload.
  function proposalStorage() {
    try { return window.sessionStorage; } catch { return null; }
  }
  useEffect(() => {
    const storage = proposalStorage();
    if (!storage) return;
    const restored = recoverReviewedProposal(storage,
      props.project.buildProjectId, props.project.sourceVersion);
    if (restored) {
      setPendingFileEdit(restored);
      setReviewRecoveryNotice("Recovered your unapplied proposal from this browser tab. Review it again before applying; no build has been verified yet.");
    }
  }, [props.project.buildProjectId, props.project.sourceVersion]);

  function discardReviewedProposal() {
    const storage = proposalStorage();
    if (storage) clearReviewedProposal(storage, props.project.buildProjectId);
    setPendingFileEdit(null);
    setReviewRecoveryNotice(null);
  }

  function acceptReviewedProposal(proposal: ZoeSourceEditProposal) {
    const storage = proposalStorage();
    const kept = storage ? keepReviewedProposal(storage,
      props.project.buildProjectId, proposal) : false;
    setPendingFileEdit(proposal);
    setReviewRecoveryNotice(kept ? null :
      "This proposal is only in memory: browser storage is unavailable or the edit is too large. Keep this tab open; restarting may lose it.");
  }
  const [applyingFileEdit, setApplyingFileEdit] = useState(false);
  const [verifyingSavedBuild, setVerifyingSavedBuild] = useState(false);
  const [savedBuildResult, setSavedBuildResult] = useState<{
    version: number;
    state: "passed" | "failed" | "not-run";
    reason: string;
    message: string;
  } | null>(null);
  const [savedBuildError, setSavedBuildError] = useState<string | null>(null);
  const [
    applyingPlan,
    setApplyingPlan,
  ] =
    useState(false);

  const [
    applyPlanError,
    setApplyPlanError,
  ] =
    useState<string | null>(
      null,
    );

  const commerceEnabled =
    (
    props.project.stackId ===
      "commerce-static-v1" ||
    props.project.stackId ===
      "commerce-react-vite-v1"
  );

  function hostedCheckoutRedirectUrl(
    value:
      unknown,
  ) {
    if (
      !value ||
      typeof value !==
        "object" ||
      Array.isArray(
        value,
      )
    ) {
      throw new Error(
        "The trusted commerce binding did not return a checkout result.",
      );
    }

    const raw =
      (
        value as
          Record<
            string,
            unknown
          >
      ).url;

    if (
      typeof raw !==
        "string" ||
      !raw.trim()
    ) {
      throw new Error(
        "The trusted commerce binding did not return a checkout URL.",
      );
    }

    let checkout:
      URL;

    try {
      checkout =
        new URL(
          raw,
        );
    } catch {
      throw new Error(
        "The trusted commerce binding returned an invalid checkout URL.",
      );
    }

    if (
      checkout.protocol !==
        "https:"
    ) {
      throw new Error(
        "Hosted checkout must use HTTPS.",
      );
    }

    return checkout.toString();
  }

  async function requestStaticPreviewCommerce(
    request:
      WebPreviewCommerceRequest,
  ) {
    const response =
      await fetch(
        `/api/build/projects/${encodeURIComponent(
          props.project.buildProjectId,
        )}/commerce/preview`,
        {
          method:
            "POST",

          credentials:
            "same-origin",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              method:
                request.method,
              input:
                request.input,
            }),
        },
      );

    const payload =
      await response
        .json()
        .catch(
          () =>
            null,
        ) as
          | {
              ok?:
                boolean;
              result?:
                unknown;
              message?:
                string;
            }
          | null;

    if (
      !response.ok ||
      !payload?.ok
    ) {
      throw new Error(
        payload?.message ??
          "Commerce preview request failed.",
      );
    }

    if (
      request.method ===
        "checkout.begin"
    ) {
      const checkoutUrl =
        hostedCheckoutRedirectUrl(
          payload.result,
        );

      /*
       * Static Preview stays opaque and never receives top-navigation
       * permission. The authenticated parent owns the provider-neutral
       * hosted-checkout redirect.
       *
       * Do not resolve this RPC after navigation begins. Generated storefront
       * source keeps its normal published-site location.assign behavior, but
       * Preview never reaches that line inside the iframe.
       */
      window.location.assign(
        checkoutUrl,
      );

      return await new Promise<never>(
        () => {},
      );
    }

    return payload.result;
  }

  function addMessage(
    message: string,
  ) {
    recordChatTurn("assistant", message);

    setSettingsOpen(false);
  }

  async function planChange(submission: ZoeBuildPromptSubmission, resumed = false) {
    if (assistantRequestInFlight.current || applyingPlan || applyingFileEdit) return;
    assistantRequestInFlight.current = true;
    // Never spend on a request whose prior chat cannot be restored safely.
    try { await ensureChatHistoryLoaded(); }
    catch { assistantRequestInFlight.current = false; return; }
    // Freeze the REAL preceding conversation (both roles) before the new user
    // message is rendered. Resuming a deferred edit reuses its original snapshot.
    const precedingHistory = resumed
      ? deferredHistoryRef.current ?? []
      : serializeZoeConversationHistory(chatHistoryRef.current);
    // A resumed prompt was already shown in the thread. Never duplicate its
    // user turn, create an AI attempt or send it to a provider while code is dirty.
    if (!resumed) {
      recordChatTurn("user", `${submission.prompt.trim() || "(media attached)"}${submission.files.length ? ` · ${submission.files.length} attachment(s)` : ""}`);
    }
    if (codeDirty) {
      deferredHistoryRef.current = precedingHistory;
      deferredAssistantSubmission.current = submission;
      setHasDeferredAssistantSubmission(true);
      setPendingPlan(null);
      pendingPlanBaseVersion.current = null;
      discardReviewedProposal();
      setApplyPlanError(null);
      setAssistantChecking(false);
      setThinkingSummary("");
      setSettingsOpen(false);
      assistantRequestInFlight.current = false;
      return;
    }
    deferredAssistantSubmission.current = null;
    deferredHistoryRef.current = null;
    setHasDeferredAssistantSubmission(false);
    // Resolve an authenticated project version BEFORE selecting the billable ID.
    // Uncertain outcomes leave the stored attempt intact for an identical retry.
    setAssistantChecking(true);
    setThinkingPhase("checking");
    setThinkingSummary("");
    setAssistantAuthNeeded(false);
    setPendingPlan(null);
    pendingPlanBaseVersion.current = null;
    discardReviewedProposal();
    setApplyPlanError(null);

    try {
      const response = await fetch(
        `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/context`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        message?: string;
        code?: string;
        project?: {
          title: string; stackId: string | null; sourceVersion: number;
          activePath: string | null; entryPath: string | null;
        };
      } | null;
      if (response.status === 503 && payload?.code === "SESSION_AUTHORITY_UNAVAILABLE") {
        throw new Error(AUTHORITY_UNAVAILABLE_MESSAGE);
      }
      if (response.status === 401 || payload?.code === "BUILD_AUTH_REQUIRED") {
        setAssistantAuthNeeded(true);
        throw new Error("Zoé could not verify your session. Reconnect to Zoéskoul to continue. No project source was changed.");
      }
      if (!response.ok || !payload?.ok || !payload.project) {
        throw new Error(payload?.message ?? "Project context could not be verified.");
      }
      const current = payload.project;
      if (current.sourceVersion !== previewSourceVersion) {
        throw new Error("Project changed since this tab loaded. Reload before retrying AI generation.");
      }
      const attempt = await getOrCreateAiBrowserAttempt({
        storage:window.sessionStorage, projectId:props.project.buildProjectId,
        sourceVersion:current.sourceVersion, prompt:submission.prompt,
        files:submission.files.map(file=>({name:file.name,size:file.size,
          lastModified:file.lastModified,type:file.type})),
        // The billing journal stores user-only prompts, never provider outputs.
        previousInstructions:previousAssistantInstructions.current.slice(-6),
        conversation:precedingHistory,
      });
      const billingOperationId=attempt.id;
      if (attempt.recovered && attempt.conversation === null &&
          requestConversationRef.current?.operationId !== billingOperationId) {
        // Pre-upgrade attempts lack the exact model-request snapshot. Inspect
        // server-owned billing reservations without clearing the browser ID.
        // This diagnostic MUST NOT authorize a new provider call.
        let auditMessage = "Its original conversation was not preserved, so the operation cannot be replayed automatically.";
        try {
          const auditResponse = await fetch(
            `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/attempt-status?operationId=${encodeURIComponent(billingOperationId)}`,
            {credentials:"same-origin",cache:"no-store"});
          const audit = await auditResponse.json().catch(()=>null) as {ok?:boolean; state?:string}|null;
          if (auditResponse.ok && audit?.ok) {
            auditMessage = audit.state === "held" ? "A credit reservation is still held and requires reconciliation." :
              audit.state === "terminal" ? "The recorded reservations are closed; the original conversation is still missing." :
              "No completed reservation is recorded; this does not establish that the model request never ran.";
          }
        } catch { /* Audit unavailable: always fail closed. */ }
        throw new Error(`The interrupted AI attempt needs review. ${auditMessage} No new AI request was sent or billed by this retry.`);
      }
      // Resumed requests use ONLY the frozen original context; a refreshed
      // chat window or newer user turn cannot rewrite the billed request.
      requestConversationRef.current={operationId:billingOperationId,
        history:attempt.conversation ?? requestConversationRef.current?.history ?? precedingHistory};
      const conversationForAttempt=requestConversationRef.current.history;
      pendingAiBillingAttempt.current={id:billingOperationId};
      const commitCompletedAttempt=()=>{
        completeAiBrowserAttempt({storage:window.sessionStorage,
          projectId:props.project.buildProjectId,id:billingOperationId});
        pendingAiBillingAttempt.current=null;
        if (requestConversationRef.current?.operationId === billingOperationId)
          requestConversationRef.current=null;
        previousAssistantInstructions.current=[...attempt.previousInstructions,submission.prompt].slice(-6);
      };
      // A model interprets the *complete* request and conversation context.
      // Local keyword lists do not decide whether the user meant edit/rebuild/settings.
      const intentResponse = await fetch(
        `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/intent`,
        { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", [ZOE_AI_OPERATION_HEADER]: billingOperationId },
          body: JSON.stringify({ prompt: submission.prompt, baseVersion: current.sourceVersion,
            previousInstructions: attempt.previousInstructions,
            conversation: conversationForAttempt }) },
      );
      const intentResult = await intentResponse.json().catch(() => null) as {
        ok?: boolean; code?: string; message?: string; intent?: ZoeSemanticIntent;
      } | null;
      if (intentResponse.status === 503 && intentResult?.code === "SESSION_AUTHORITY_UNAVAILABLE") {
        throw new Error(AUTHORITY_UNAVAILABLE_MESSAGE);
      }
      if (intentResponse.status === 401 || intentResult?.code === "BUILD_AUTH_REQUIRED") {
        setAssistantAuthNeeded(true);
        throw new Error("Zoé could not verify your session. Reconnect to Zoéskoul to continue. No project source was changed.");
      }
      if(intentResult?.code === "BUILD_AI_EDIT_NOT_ENTITLED") throw new Error(AI_EDIT_ACCESS_MESSAGE);
      if(intentResult?.code === "BUILD_AI_BILLING_NOT_READY")
        throw new Error("Metered Zoé interpretation is not yet approved; no intent AI request was executed. Check ZoeBuild Billing for readiness.");
      if(isAiCreditShortageCode(intentResult?.code))throw new ZoeAiCreditShortageError();
      if (!intentResponse.ok || !intentResult?.ok || !intentResult.intent) {
        throw new Error(intentResult?.message ?? intentResult?.code ?? "Zoé could not interpret the request.");
      }
      const semantic = intentResult.intent;
      if (submission.files.length && semantic.action !== "full_rebuild") {
        throw new Error("This request includes media, but this action does not support media. The attachment was not sent to the editor or silently ignored.");
      }
      // History advances only after the whole logical request succeeds.

      if (semantic.action === "clarify") {
        commitCompletedAttempt();
        addMessage(semantic.reply || "Could you clarify what you want Zoé to do in this project?");
        return;
      }
      if (semantic.action === "answer") {
        // Distinct canonical answer reservation under the SAME logical browser
        // operation. Never complete/replace the attempt until answer is settled.
        // The server generates and settles before sending the answer stream.
        setThinkingPhase("model_requested");
        const answerResponse = await fetch(
          `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/answer`,
          {method:"POST",credentials:"same-origin",
            headers:{"Content-Type":"application/json","Accept":"text/event-stream",
              [ZOE_AI_OPERATION_HEADER]:billingOperationId},
            body:JSON.stringify({prompt:submission.prompt,baseVersion:current.sourceVersion,
              conversation:conversationForAttempt})},
        );
        if (answerResponse.status === 401) {
          setAssistantAuthNeeded(true);
          throw new Error("Zoé could not verify your session. Reconnect to continue.");
        }
        if (!answerResponse.ok) {
          const failure = await answerResponse.json().catch(()=>null) as
            {code?:string;message?:string} | null;
          if (answerResponse.status === 503 && failure?.code === "SESSION_AUTHORITY_UNAVAILABLE")
            throw new Error(AUTHORITY_UNAVAILABLE_MESSAGE);
          if (isAiCreditShortageCode(failure?.code)) throw new ZoeAiCreditShortageError();
          throw new Error(failure?.message ?? failure?.code ?? "Zoé could not complete its answer.");
        }
        // Do not store a partial answer after a dropped connection. The server
        // has already settled generation before releasing visible content.
        const completeAnswer = await readZoeAnswerEventStream(answerResponse);
        commitCompletedAttempt();
        addMessage(completeAnswer);
        return;
      }
      if (semantic.action === "provider_settings") {
        commitCompletedAttempt();
        // Semantic model selected a provider; resolve its exact canonical ID.
        // This is navigation, not a connection command or permission grant.
        const known = resolveZoeSelectedProvider(semantic.provider);
        if (known?.kind === "provider") {
          setAssistantSettingsSection(known.section);
          addMessage(known.setup === "unavailable"
            ? `${known.providerName} is not connected: ZoeBuild has no enabled setup workflow for this provider. Your choice was preserved; no substitute was connected.`
            : `${known.providerName} settings opened. Check the actual project connection and authorize setup there; no connection or activation was changed.`);
        } else if (known?.kind === "ambiguous") {
          setAssistantSettingsSection(undefined);
          addMessage(`${known.name} appears in multiple settings categories (${known.sections.join(" and ")}). Which capability should I open? No connection was changed.`);
        } else {
          setAssistantSettingsSection(undefined);
          addMessage(semantic.provider.trim()
            ? "Site settings opened. The requested provider isn't registered for setup here. No connection was changed."
            : "Site settings opened. Choose the provider or capability you'd like to configure. No connection was changed.");
        }
        setAssistantNavigationVersion(version => version + 1);
        setSettingsOpen(true);
        return;
      }
      if (semantic.action === "edit") {
        if (codeDirty) throw new Error("Save or discard unsaved editor changes before preparing an AI edit.");
        if (current.sourceVersion !== previewSourceVersion) throw new Error("Project changed since this tab loaded. Reload before editing.");
        if (submission.files.length) throw new Error("Targeted source edits do not yet accept media. Nothing was silently dropped.");
        setThinkingPhase("model_requested");
        const editResponse = await fetch(
          `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/edit`,
          { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Accept": "text/event-stream", [ZOE_AI_OPERATION_HEADER]: billingOperationId },
            body: JSON.stringify({ prompt: submission.prompt, baseVersion: current.sourceVersion,
              pagePath: semantic.pagePath === "none" ? null : semantic.pagePath,
              conversation: conversationForAttempt }) },
        );
        const streamed = editResponse.ok && editResponse.headers.get("content-type")?.includes("text/event-stream") === true
          ? await readZoeEditEventStream({response:editResponse,
              onReasoning: delta => setThinkingSummary(text => (text + delta).slice(0, 12_000)),
              onStatus: setThinkingPhase}) : null;
        const editResult = streamed ? {ok:true, proposal:streamed.proposal,
          clarification:streamed.clarification} :
          await editResponse.json().catch(() => null) as {
            ok?: boolean; message?: string; code?: string; proposal?: ZoeSourceEditProposal | null;
            clarification?: string | null;
          } | null;
        if (streamed?.reasoningSummary) setThinkingSummary(streamed.reasoningSummary);
        if (editResponse.status === 503 && editResult?.code === "SESSION_AUTHORITY_UNAVAILABLE") {
          throw new Error(AUTHORITY_UNAVAILABLE_MESSAGE);
        }
        if (editResponse.status === 401 || editResult?.code === "BUILD_AUTH_REQUIRED") {
          setAssistantAuthNeeded(true);
          throw new Error("Zoé could not verify your session. Reconnect to Zoéskoul to continue. No source was changed.");
        }
        if (editResult?.code === "BUILD_AI_EDIT_NOT_ENTITLED") {
          throw new Error(AI_EDIT_ACCESS_MESSAGE);
        }
        if(editResult?.code === "BUILD_AI_BILLING_NOT_READY")
          throw new Error("Metered targeted editing is not yet approved. No targeted edit was executed. The earlier intent request may already have used credits; check wallet activity before retrying.");
        if(isAiCreditShortageCode(editResult?.code))throw new ZoeAiCreditShortageError();
        if (editResponse.ok && editResult?.ok &&
            typeof editResult.clarification === "string" && editResult.clarification.trim()) {
          // The intent and edit attempts completed; a clarification is not an edit.
          // Never create a proposal or retry an already-finished provider request.
          commitCompletedAttempt();
          setThinkingSummary("");
          setThinkingPhase("checking");
          addMessage(editResult.clarification);
          return;
        }
        if (!editResponse.ok || !editResult?.ok || !editResult.proposal) {
          throw new Error(editResult?.message ?? editResult?.code ?? "Zoé could not propose a targeted edit.");
        }
        acceptReviewedProposal(editResult.proposal);
        commitCompletedAttempt();
        addMessage(`Zoé proposed ${editResult.proposal.edits.length} targeted file change(s): ${editResult.proposal.summary}. Review each file before applying. Nothing has been changed.`);
        return;
      }

      // Explicit full rebuilding is a distinct existing planning workflow.
      if (codeDirty) throw new Error("Save or discard unsaved editor changes before planning a full regeneration.");
      const plan = await requestZoeBuildPlan({
        ...submission,
        prompt: [
          "Full project regeneration requested. This is not an incremental source edit.",
          `Current project: ${current.title}.`,
          `Current registered stack: ${current.stackId ?? "none"}.`,
          `Current source version: ${current.sourceVersion}.`,
          `Active path: ${current.activePath ?? "none"}.`,
          "Do not invent provider connections, credentials, or payment behavior.",
          "User instruction:", submission.prompt,
        ].join("\n"),
      }, billingOperationId);
      pendingPlanBaseVersion.current = current.sourceVersion;
      setPendingPlan(plan);
      commitCompletedAttempt();
      addMessage(formatZoeBuildPlan(
        plan,
        "Full regeneration proposal: applying this will replace existing source, not patch selected files. This plan has not been applied to project source yet.",
      ));
    } catch (error) {
      // Let the composer show the inline funding prompt. Preserve its draft and media.
      if(isAiCreditShortage(error))throw error;
      addMessage(error instanceof Error ? error.message : "Zoé could not check the current project.");
    } finally {
      assistantRequestInFlight.current = false;
      setAssistantChecking(false);
    }
  }

  async function refreshAfterSuccessfulApply(
    expectedVersion: number,
    approvedEdits?: ZoeSourceEditProposal["edits"],
  ): Promise<readonly string[]> {
    const latest = await fetchAuthoritativeAppliedProject({
      buildProjectId: props.project.buildProjectId,
      expectedSourceVersion: expectedVersion,
    });
    // A version match is insufficient: check each file actually matches the
    // approved proposal, before replacing any in-memory editor/preview state.
    const verifiedPaths = approvedEdits ? verifyAppliedZoeSource(latest.workspace, approvedEdits) : [];
    // Do not overwrite manual edits that appeared while a server apply was running.
    if (codeDirtyRef.current) throw new Error("APPLIED_EDITOR_BECAME_DIRTY");
    setEditorProject(latest);
    setPreviewWorkspace(latest.workspace);
    setPreviewSourceVersion(latest.sourceVersion);
    setSavedBuildResult(null);
    setSavedBuildError(null);
    codeDirtyRef.current = false;
    setCodeDirty(false);
    setEditorHydrationEpoch(current => current + 1);
    return verifiedPaths;
  }

  async function verifySavedReactBuild() {
    // A manual, non-AI action. Never replace working preview or send unsaved source.
    if (verifyingSavedBuild) return;
    if (codeDirtyRef.current || assistantRequestInFlight.current || applyingFileEdit || applyingPlan) {
      setSavedBuildError("Save code and finish any active operation before verifying the saved build.");
      return;
    }
    setVerifyingSavedBuild(true);
    setSavedBuildError(null);
    setSavedBuildResult(null);
    const sourceVersion = previewSourceVersion;
    try {
      const response = await fetch(
        `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/verify-build`,
        {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({sourceVersion})},
      );
      const result = await response.json().catch(()=>null) as {
        ok?:boolean; code?:string; message?:string;
        verification?:{state:"passed"|"failed"|"not-run"; reason:string; message:string; sourceVersion:number};
      } | null;
      if (!response.ok || !result?.ok || !result.verification) {
        throw new Error(result?.message ?? result?.code ?? "Saved build verification unavailable.");
      }
      if (result.verification.sourceVersion !== sourceVersion)
        throw new Error("The returned verification does not match the requested source version.");
      setSavedBuildResult({version:sourceVersion, state:result.verification.state,
        reason:result.verification.reason, message:result.verification.message});
    } catch (error) {
      setSavedBuildError(error instanceof Error ? error.message : "Saved build verification unavailable.");
    } finally {setVerifyingSavedBuild(false);}
  }

  async function applyPendingFileEdit() {
    if (!pendingFileEdit || applyingFileEdit) return;
    if (codeDirty || previewSourceVersion !== pendingFileEdit.baseVersion) {
      setApplyPlanError("Unsaved or newer changes exist. Save/reload and request a new proposal.");
      return;
    }
    setApplyingFileEdit(true);
    setApplyPlanError(null);
    try {
      const response = await fetch(
        `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/assistant/edit`,
        { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseVersion: pendingFileEdit.baseVersion,
            edits: pendingFileEdit.edits.map(({path, beforeSha256, content, create}) => ({ path, beforeSha256, content, create: create === true })) }) },
      );
      const data = await response.json().catch(() => null) as { ok?: boolean; message?: string; code?: string; sourceVersion?: number } | null;
      if (!response.ok || !data?.ok) throw new Error(data?.message ?? data?.code ?? "Changes could not be applied.");
      const savedVersion = data.sourceVersion;
      if (typeof savedVersion !== "number" || !Number.isSafeInteger(savedVersion) || savedVersion < 1) {
        throw new Error("The edit was accepted but its saved source version could not be verified. Reload to inspect the server source before editing again.");
      }
      const approvedEdits = pendingFileEdit.edits;
      discardReviewedProposal();
      addMessage(`Approved edits saved as source v${savedVersion}. Checking the saved files before updating Preview.`);
      try {
        const verifiedPaths = await refreshAfterSuccessfulApply(savedVersion, approvedEdits);
        addMessage(`Verified ${verifiedPaths.length} saved file(s) in source v${savedVersion}: ${verifiedPaths.join(", ")}. Preview received the saved source; check its rendered result. If the change affects another page, open that page in the Preview address bar; source verification does not prove the visible design matches your request.`);
        setThinkingSummary("");
        setThinkingPhase("checking");
      } catch {
        // The PATCH already committed: never retry it or call the provider again.
        // The browser is deliberately left untouched on an unverified refresh.
        setApplyPlanError("Edits were saved, but the source snapshot could not be verified or the editor became dirty. Do not reapply. Preserve unsaved work and refresh after resolving it.");
        addMessage("The edit was saved, but Preview was not synchronized. Do not retry the apply; inspect the source and refresh after preserving any manual edits.");
      }
    } catch (error) {
      setApplyPlanError(error instanceof Error ? error.message : "Edits could not be applied.");
    } finally { setApplyingFileEdit(false); }
  }

  async function applyPendingPlan() {
    if (
      !pendingPlan ||
      applyingPlan
    ) {
      return;
    }

    if (codeDirty) {
      setApplyPlanError("Save or discard unsaved editor changes before replacing project source.");
      return;
    }
    if (pendingPlanBaseVersion.current === null ||
        pendingPlanBaseVersion.current !== previewSourceVersion) {
      setApplyPlanError("Project source has changed since this plan was generated. Reload and request a new plan.");
      return;
    }
    setApplyingPlan(true);
    setApplyPlanError(null);

    try {
      const response =
        await fetch(
          `/api/build/projects/${encodeURIComponent(
            props.project.buildProjectId,
          )}/apply-plan`,
          {
            method: "POST",

            credentials:
              "same-origin",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                baseVersion:
                  pendingPlanBaseVersion.current,

                specification:
                  pendingPlan.specification,
              }),
          },
        );

      const payload =
        await response.json() as {
          ok?: boolean;

          message?: string;

          apply?: {
            sourceVersion:
              number;
          };
        };

      if (
        !response.ok ||
        !payload.ok ||
        !payload.apply
      ) {
        throw new Error(
          payload.message ??
            "Plan could not be applied.",
        );
      }

      addMessage(
        `Plan applied to source version ${payload.apply.sourceVersion}.`,
      );

      setPendingPlan(null);
      pendingPlanBaseVersion.current = null;
      try {
        await refreshAfterSuccessfulApply(payload.apply.sourceVersion);
        // Successful application is reported in chat, not as a lingering proposal.
        setThinkingSummary("");
        setThinkingPhase("checking");
      } catch {
        // The apply command already succeeded; don't submit a second plan.
        setApplyPlanError("The plan was saved, but the updated workspace could not be loaded. Refresh this page before making another edit.");
      }
    } catch (error) {
      setApplyPlanError(
        error instanceof Error
          ? error.message
          : "Plan could not be applied.",
      );
    } finally {
      setApplyingPlan(false);
    }
  }

  function importShopify(
    draft:
      ShopifyImportDraft,
  ) {
    setCommerceCandidate(
      draft.hostname,
    );

    recordChatTurn("assistant", `Shopify address validated: ${draft.hostname}. No store connection has been created yet.`);

    if (commerceEnabled) {
      setSettingsOpen(true);
    }
  }

  return (
    <div className="zb-project-frame">
      <aside
        className="zb-project-assistant-rail"
        aria-label="Zoé project assistant"
      >
        <header className="zb-project-assistant-header">
        <Link
          className="zb-project-rail-projects"
          href={`/${encodeURIComponent(props.locale)}/projects`}
          aria-label="Back to projects"
          title="Projects"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M14.5 6.5 9 12l5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

          <div
            className="zb-project-assistant-avatar"
            aria-hidden="true"
          >
            Z
          </div>

          <div>
            <strong>
              Zoé
            </strong>

            <p>
              Design, build, and refine this project.
            </p>
          </div>
        </header>

        <div className="zb-project-assistant-thread" ref={chatThreadRef}
          onScroll={onZoeChatThreadScroll}
          onWheel={(event) => {
            if (event.deltaY < 0) noteZoeReaderScroll("up");
            else if (event.deltaY > 0) noteZoeReaderScroll("down");
          }}
          onKeyDown={(event) => {
            if (["ArrowUp", "PageUp", "Home"].includes(event.key) ||
                (event.key === " " && event.shiftKey)) noteZoeReaderScroll("up");
            if (["ArrowDown", "PageDown", "End"].includes(event.key) ||
                (event.key === " " && !event.shiftKey)) noteZoeReaderScroll("down");
          }}
          onTouchStart={(event) => {
            chatTouchYRef.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchMove={(event) => {
            const y = event.touches[0]?.clientY;
            if (y === undefined) return;
            const prev = chatTouchYRef.current;
            if (prev !== null && Math.abs(y - prev) > 1) {
              // Finger moves downward when the reader scrolls content upward.
              noteZoeReaderScroll(y > prev ? "up" : "down");
            }
            chatTouchYRef.current = y;
          }}
          onTouchEnd={() => { chatTouchYRef.current = null; }}
          onPointerDown={(event) => {
            // Pointer movements are only scroll gestures when dragging the
            // rail's scrollbar, not when selecting text or clicking Copy.
            const edge = event.currentTarget.getBoundingClientRect().right;
            if (event.clientX >= edge - 18) chatScrollbarDragYRef.current = event.clientY;
          }}
          onPointerMove={(event) => {
            const prev = chatScrollbarDragYRef.current;
            if (prev === null) return;
            if (Math.abs(event.clientY - prev) > 1)
              noteZoeReaderScroll(event.clientY > prev ? "down" : "up");
            chatScrollbarDragYRef.current = event.clientY;
          }}
          onPointerUp={() => { chatScrollbarDragYRef.current = null; }}
          onPointerCancel={() => { chatScrollbarDragYRef.current = null; }}
        >
          {messages.length === 0 ? (
            <div className="zb-project-assistant-empty">
              <strong>
                What should we build next?
              </strong>

              <p>
                Ask Zoé to change the design, content, layout, or project behavior.
              </p>
            </div>
          ) : (
            messages.map(
              (
                message,
                index,
              ) => (
                <ZoeAssistantMessage
                  key={`${index}:${message.role}:${message.text}`}
                  message={message.text}
                  role={message.role}
                  animate={message.role === "assistant" && index === messages.length - 1}
                />
              ),
            )
          )}

            {chatHistoryError ? <p role="status" className="zb-project-assistant-plan-error">{chatHistoryError}</p> : null}
          <ZoeThinkingPanel busy={assistantChecking} phase={thinkingPhase} summary={thinkingSummary}/>
          {hasDeferredAssistantSubmission ? (
            <section className="zb-project-assistant-plan" aria-label="Save source before asking Zoé">
              <strong>{codeDirty ? "Unsaved code changes" : "Ready to continue"}</strong>
              <p>{codeDirty
                ? "Zoé has not called the AI provider. Save your current source in Code view, then continue this request. Your unsaved work will not be discarded."
                : "Your source is saved. Continue your original request using the latest project version."}</p>
              <button type="button" className={`zb-project-assistant-apply ${actionStyles.primary}`}
                disabled={assistantChecking || applyingFileEdit || applyingPlan}
                onClick={() => {
                  if (codeDirty) {
                    setSettingsOpen(false);
                    setMode("code");
                    return;
                  }
                  const submission = deferredAssistantSubmission.current;
                  if (submission) void planChange(submission, true);
                }}>
                {codeDirty ? "Open Code to save" : "Continue with Zoé"}
              </button>
              <button type="button" onClick={() => {
                deferredAssistantSubmission.current = null;
                setHasDeferredAssistantSubmission(false);
              }}>Cancel pending request</button>
            </section>
          ) : null}
          {assistantAuthNeeded ? (
            <a
              className="zb-project-assistant-apply"
              href={`/api/auth/handoff/start?returnTo=${encodeURIComponent(`/${props.locale}/projects/${props.project.buildProjectId}`)}&locale=${encodeURIComponent(props.locale)}`}
            >
              Reconnect Zoéskoul session
            </a>
          ) : null}

          {props.project.stackId === "react-vite-v1" ? (
            <ProjectRevisionHistory
              buildProjectId={props.project.buildProjectId}
              currentVersion={previewSourceVersion}
              disabled={codeDirty || assistantChecking || applyingFileEdit || applyingPlan || Boolean(pendingFileEdit) || Boolean(pendingPlan)}
              onRestored={async (savedVersion, fromVersion) => {
                await refreshAfterSuccessfulApply(savedVersion);
                addMessage(`Restored source v${fromVersion} as new source v${savedVersion}. The prior versions remain in history. Preview received the restored source; check its appearance before publishing.`);
              }}
            />
          ) : null}
          {props.project.stackId === "react-vite-v1" && !pendingFileEdit ? (
            <section className="zb-project-assistant-plan" aria-label="Verify saved React build">
              <span className="zb-project-assistant-plan-status">Saved React source · v{previewSourceVersion}</span>
              <p>Check the currently saved source in the isolated runner without an AI request, source change, publish or Preview restart.</p>
              <button type="button" onClick={() => void verifySavedReactBuild()}
                disabled={verifyingSavedBuild || assistantChecking || applyingFileEdit || applyingPlan || codeDirty}>
                {verifyingSavedBuild ? "Verifying saved build…" : "Verify saved build (no AI)"}
              </button>
              {savedBuildError ? <p role="alert">{savedBuildError}</p> : null}
              {savedBuildResult?.version === previewSourceVersion ? (
                <p role="status" data-testid="zoe-saved-build-verification">
                  <strong>Saved build: {savedBuildResult.state === "passed" ? "Passed" :
                    savedBuildResult.state === "failed" ? "Failed" : "Not verified"}.</strong>{" "}
                  {savedBuildResult.message} ({savedBuildResult.reason})
                </p>
              ) : null}
            </section>
          ) : null}
          {pendingFileEdit ? (
            <section className="zb-project-assistant-plan" aria-label="Pending targeted source edits">
              <span className="zb-project-assistant-plan-status">Review targeted edits · source v{pendingFileEdit.baseVersion}</span>
              <strong>{pendingFileEdit.summary}</strong>
              {reviewRecoveryNotice ? <p role="status">{reviewRecoveryNotice}</p> : null}
              <p>Review all proposed file changes, including new pages. Nothing is saved until you approve. React changes are verified again before saving, without another AI request.</p>
              {pendingFileEdit.buildVerification ? (
                <p role="status" data-testid="zoe-isolated-build-verification">
                  <strong>Isolated build: {pendingFileEdit.buildVerification.state === "passed" ? "Passed" :
                    pendingFileEdit.buildVerification.state === "failed" ? "Failed" : "Not verified"}.</strong>{" "}
                  {pendingFileEdit.buildVerification.message}
                  {pendingFileEdit.buildVerification.snapshotSha256 ?
                    ` Candidate ${pendingFileEdit.buildVerification.snapshotSha256.slice(0, 12)}.` : ""}
                </p>
              ) : null}
              {pendingFileEdit.edits.map((edit) => (
                <details key={edit.path}>
                  <summary>{edit.create ? "New page: " : "Edit: "}{edit.path}</summary>
                  <p>{edit.create ? "New file (did not exist)" : "Before"}</p>
                  <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:180,overflow:"auto"}}>{edit.beforePreview}</pre>
                  <p>After</p>
                  <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:180,overflow:"auto"}}>{edit.afterPreview}</pre>
                </details>
              ))}
              {pendingFileEdit.buildVerification?.state === "failed" ? (
                <p role="alert">This build failed. Discard the proposal and request a corrected edit; no source was changed.</p>
              ) : null}
              {applyPlanError ? <p role="alert" className="zb-project-assistant-plan-error">{applyPlanError}</p> : null}
              <button type="button" className={`zb-project-assistant-apply ${actionStyles.primary}`}
                disabled={applyingFileEdit || pendingFileEdit.buildVerification?.state === "failed"}
                onClick={() => void applyPendingFileEdit()}>
                {applyingFileEdit ? "Applying..." : "Apply reviewed file edits"}
              </button>
              <button type="button" onClick={() => { discardReviewedProposal(); setApplyPlanError(null); }}>Discard proposal</button>
            </section>
          ) : null}

          {pendingPlan ? (
            <section
              className="zb-project-assistant-plan"
              aria-label="Pending Zoé plan"
            >
              <div>
                <span className="zb-project-assistant-plan-status">
                  Plan ready
                </span>

                <strong>
                  Review and apply the proposed changes
                </strong>

                <p>
                  Nothing changes in project source until you apply this plan. Full regeneration replaces the existing source.
                </p>

                {applyPlanError ? (
                  <p
                    className="zb-project-assistant-plan-error"
                    role="alert"
                  >
                    {applyPlanError}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                className={`zb-project-assistant-apply ${actionStyles.primary}`}
                disabled={applyingPlan}
                onClick={applyPendingPlan}
              >
                {applyingPlan
                  ? "Applying..."
                  : "Apply plan"}
              </button>
            </section>
          ) : null}
        </div>

        <div className="zb-project-assistant-composer">
          <ZoeBuildPromptComposer
                    onPrompt={planChange}
                    onShopifyImport={
                      importShopify
                    }
                    placeholder="Ask Zoé to build, change, or refine anything…"
                  />
        </div>
      </aside>

      <section className="zb-project-stage">
        <div
          className="zb-project-modebar"
          aria-label="Project workspace"
        >
          <span
            className="zb-project-modebar-title"
            title={props.project.title}
          >
            {props.project.title}
          </span>
          <div
            className="zb-project-mode-tabs"
            role="group"
            aria-label="Workspace view"
          >
            <button
              type="button"
              className="zb-project-mode-tab"
              data-active={
                !settingsOpen &&
                mode === "preview"
                  ? "true"
                  : "false"
              }
              aria-pressed={
                !settingsOpen &&
                mode === "preview"
              }
              onClick={() => {
                setSettingsOpen(false);
                setMode("preview");
              }}
            >
              <ProjectPreviewIcon className="zb-project-mode-icon" />
              Preview
            </button>

            <button
              type="button"
              className="zb-project-mode-tab"
              data-active={
                !settingsOpen &&
                mode === "code"
                  ? "true"
                  : "false"
              }
              aria-pressed={
                !settingsOpen &&
                mode === "code"
              }
              onClick={() => {
                setSettingsOpen(false);
                setMode("code");
              }}
            >
              <ProjectCodeIcon className="zb-project-mode-icon" />
              Code
            </button>

            <button
              type="button"
              className="zb-project-mode-tab"
              data-active={settingsOpen ? "true" : "false"}
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              Site Settings
            </button>
          </div>

          <PublishProjectButton
            buildProjectId={props.project.buildProjectId}
            initialDeployment={props.initialDeployment}
          />
          {commerceEnabled && !settingsOpen && mode === "preview" ? (
            <StripeCheckoutReturnNotice buildProjectId={props.project.buildProjectId} />
          ) : null}
        </div>

        <div className="zb-project-stage-body">
    <main className="zb-builder-shell">

      <section className="zb-builder-stage">
        <div
          className="zb-project-preview-stage"
          hidden={settingsOpen || mode !== "preview"}
          aria-hidden={settingsOpen || mode !== "preview"}
        >
            {reactPreviewEnabled && reactPreview ? (
              <PersistentReactPreviewSlot
                buildProjectId={
                  props.project.buildProjectId
                }
                slotId="project-preview"
                preview={reactPreview}
                active={
                  !settingsOpen &&
                  mode === "preview"
                }
              />
            ) : (
              <WebPreview
                entries={previewEntries}
                title={`${props.project.title} preview`}
                sessionKey={props.project.buildProjectId}
                onCommerceRequest={
                  commerceEnabled
                    ? requestStaticPreviewCommerce
                    : undefined
                }
              />
            )}
        </div>

        <div
          className="zb-code-stage"
          hidden={settingsOpen || mode !== "code"}
          aria-hidden={settingsOpen || mode !== "code"}
        >
          <BuildWorkspaceClient
            key={`${props.project.buildProjectId}:applied:${editorHydrationEpoch}`}
            project={editorProject}
            onWorkspaceSnapshot={setPreviewWorkspace}
            onSourceVersionChange={setPreviewSourceVersion}
            onDirtyChange={(dirty) => {
              codeDirtyRef.current = dirty;
              setCodeDirty(dirty);
            }}
            remoteWebPreview={reactPreviewEnabled ? reactPreview : null}
            remotePreviewActive={
              !settingsOpen && mode === "code"
            }
            webPreviewCommerceRequest={
              commerceEnabled && !reactPreviewEnabled
                ? requestStaticPreviewCommerce
                : undefined
            }
          />
        </div>


        {settingsOpen ? (
          <SiteSettingsWorkspacePanel
            key={`assistant-settings:${assistantNavigationVersion}`}
            initialSection={assistantSettingsSection ?? (shopifyConnectedReturn ? "commerce" : undefined)}
            project={props.project}
            candidateHostname={commerceCandidate}
            commerceEnabled={commerceEnabled}
          />
        ) : null}
      </section>


    </main>
        </div>
      </section>
    </div>
  );
}
