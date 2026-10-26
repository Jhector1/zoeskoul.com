"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  parseShopifyStoreUrl,
  type ShopifyImportDraft,
} from "@/lib/import/shopify";
import Tooltip from "@zoeskoul/learner-workspace/ui/Tooltip";
import {usePathname} from "next/navigation";
import {isAiCreditShortage} from "@/lib/billing/creditShortage";

export const ZOEBUILD_COMPOSER_MAX_MEDIA_FILES = 4;

export type ZoeBuildPromptSubmission = Readonly<{
  prompt: string;
  files: readonly File[];
}>;

function isSupportedPromptFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/")
  );
}

function voiceExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function ZoeBuildPromptComposer(props: {
  onPrompt: (
    submission: ZoeBuildPromptSubmission,
  ) => void | Promise<void>;
  onShopifyImport: (
    draft: ShopifyImportDraft,
  ) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  // React state updates are asynchronous. Ref blocks same-tick duplicate submits.
  const submitInFlightRef = useRef(false);
  // Do not erase a newer draft if the user edits while the prior request resolves.
  const draftRevisionRef = useRef(0);
  const [outOfCredits,setOutOfCredits]=useState(false);
  const pathname=usePathname();
  const segment=pathname?.split("/")[1];
  const billingLocale=segment==="fr"||segment==="ht"?segment:"en";
  const [creditStatus,setCreditStatus]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    const reload=async()=>{
      try{
        const response=await fetch("/api/billing/credits",{credentials:"same-origin",cache:"no-store"});
        if(!response.ok)return;
        const data=await response.json() as {subscriptionAvailableUnits:string;purchasedAvailableUnits:string;meteringStatus:string;unit:string};
        if(!active||data.unit!=="ledger_unit")return;
        const units=(BigInt(data.subscriptionAvailableUnits)+BigInt(data.purchasedAvailableUnits)).toLocaleString("en-US");
        setCreditStatus(data.meteringStatus==="not_activated"?`AI ledger: ${units} units · metering not active`:`AI ledger: ${units} units`);
      }catch{/* No balance claim if unavailable. */}
    };
    void reload();const onFocus=()=>{if(document.visibilityState==="visible")void reload();};
    window.addEventListener("focus",onFocus);
    return ()=>{active=false;window.removeEventListener("focus",onFocus);};
  },[]);
  const [recording, setRecording] = useState(false);
  const [promptError, setPromptError] =
    useState<string | null>(null);
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [shopifyUrl, setShopifyUrl] = useState("");
  const [shopifyError, setShopifyError] =
    useState<string | null>(null);

  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      voiceStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
    };
  }, []);

  function addFiles(incoming: readonly File[]) {
    draftRevisionRef.current += 1;
    const supported = incoming.filter(isSupportedPromptFile);

    if (supported.length !== incoming.length) {
      setPromptError(
        "Only image, video, and audio files can be added.",
      );
    } else {
      setPromptError(null);
    }

    setFiles((current) => {
      const next = [...current, ...supported];

      if (next.length > ZOEBUILD_COMPOSER_MAX_MEDIA_FILES) {
        setPromptError(
          `Add at most ${ZOEBUILD_COMPOSER_MAX_MEDIA_FILES} media files per request.`,
        );
      }

      return next.slice(0, ZOEBUILD_COMPOSER_MAX_MEDIA_FILES);
    });
  }

  function chooseMedia(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function removeFile(index: number) {
    draftRevisionRef.current += 1;
    setFiles((current) =>
      current.filter((_file, fileIndex) => fileIndex !== index),
    );
  }

  async function toggleVoiceRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPromptError(
        "Voice recording is not supported in this browser. You can upload an audio file instead.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recorder = new MediaRecorder(stream);

      voiceStreamRef.current = stream;
      recorderRef.current = recorder;
      voiceChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType =
          recorder.mimeType ||
          voiceChunksRef.current[0]?.type ||
          "audio/webm";

        const blob = new Blob(voiceChunksRef.current, {
          type: mimeType,
        });

        if (blob.size > 0) {
          addFiles([
            new File(
              [blob],
              `voice-${Date.now()}.${voiceExtension(mimeType)}`,
              { type: mimeType },
            ),
          ]);
        }

        stream.getTracks().forEach((track) => track.stop());
        voiceChunksRef.current = [];
        voiceStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };

      recorder.start();
      setPromptError(null);
      setRecording(true);
    } catch {
      voiceStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
      voiceStreamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setPromptError(
        "Microphone access was not available. You can upload an audio file instead.",
      );
    }
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitInFlightRef.current) return;
    const prompt = value.trim();
    if (!prompt && files.length === 0) return;
    const submittedRevision = draftRevisionRef.current;
    submitInFlightRef.current = true;
    setBusy(true);
    setPromptError(null);
    setOutOfCredits(false);

    try {
      await props.onPrompt({
        prompt,
        files,
      });
      // The parent has accepted the submission (including an explicitly
      // deferred Save → Continue request). Preserve any newer unsent draft.
      // Rejected credit/authorization requests take the catch path unchanged.
      if (draftRevisionRef.current === submittedRevision) {
        setValue("");
        setFiles([]);
        draftRevisionRef.current += 1;
      }
    } catch (error) {
      if(isAiCreditShortage(error)) {
        setOutOfCredits(true);
        return;
      }
      setPromptError(
        error instanceof Error
          ? error.message
          : "Zoé could not process this request.",
      );
    } finally {
      submitInFlightRef.current = false;
      setBusy(false);
    }
  }

  function submitShopify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = parseShopifyStoreUrl(shopifyUrl);

    if (!parsed) {
      setShopifyError("Enter a valid Shopify store URL.");
      return;
    }

    setShopifyError(null);
    props.onShopifyImport(parsed);
  }

  const canSubmit = Boolean(value.trim()) || files.length > 0;

  return (
    <div className="zb-composer-wrap">
      {shopifyOpen ? (
        <form
          className="zb-shopify-import"
          onSubmit={submitShopify}
        >
          <input
            type="text"
            inputMode="url"
            value={shopifyUrl}
            onChange={(event) =>
              setShopifyUrl(event.target.value)
            }
            placeholder="your-store.myshopify.com"
            aria-label="Shopify store URL"
          />
          <button type="submit">Continue</button>
          <button
            type="button"
            className="zb-import-cancel"
            onClick={() => {
              setShopifyOpen(false);
              setShopifyError(null);
            }}
          >
            Cancel
          </button>

          {shopifyError ? (
            <div
              className="zb-composer-error"
              role="alert"
            >
              {shopifyError}
            </div>
          ) : null}
        </form>
      ) : null}

      <form
        className="zb-prompt-composer"
        onSubmit={submitPrompt}
      >
        {creditStatus?<p className="px-3 text-xs opacity-60" aria-live="polite">{creditStatus}</p>:null}
        <textarea className="zb-prompt-textarea"
          value={value}
          onChange={(event) => {
            draftRevisionRef.current += 1;
            setValue(event.target.value);
          }}
          placeholder={
            props.placeholder ??
            "Tell Zoé what you want to build..."
          }
          rows={3}
          aria-label="Tell Zoé what you want to build"
        />

        {files.length > 0 ? (
          <div
            className="zb-composer-media"
            aria-label="Attached media"
          >
            {files.map((file, index) => (
              <span
                className="zb-media-chip"
                key={`${file.name}-${file.size}-${index}`}
              >
                <span
                  className="zb-media-chip-name"
                  title={file.name}
                >
                  {file.type.startsWith("image/")
                    ? "Image"
                    : file.type.startsWith("video/")
                      ? "Video"
                      : "Audio"}
                  : {file.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeFile(index)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {outOfCredits ? (
          <aside role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm space-y-3">
            <div className="font-semibold">Zoé needs more AI credits for this request</div>
            <p>Nothing was changed or charged by this attempt. Your prompt and attachments remain in the composer; the editor and preview are still available.</p>
            <p>Billing and available credits can be reviewed in a separate tab. Return here to submit again when the server confirms enough credits.</p>
            <a href={`/${billingLocale}/billing`} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-lg border border-current/20 px-3 py-2 font-semibold">Review billing and credits ↗</a>
          </aside>
        ) : null}
        {promptError ? (
          <div
            className="zb-composer-error"
            role="alert"
          >
            {promptError}
          </div>
        ) : null}

        <div className="zb-composer-actions zb-prompt-actions">
          <input
            ref={mediaInputRef}
            className="zb-media-input"
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            onChange={chooseMedia}
            aria-label="Upload image, video, or audio"
          />


<Tooltip
  tip="Add media"
  side="top"
>
  <button
            type="button"
            className="zb-media-button"
            onClick={() => mediaInputRef.current?.click()}
            disabled={busy}
           aria-label="Add media">

<svg
  className="zb-composer-action-icon"
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <path
    d="M12 5v14M5 12h14"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
  />
</svg>
  </button>
</Tooltip>


<Tooltip
  tip="Record voice"
  side="top"
>
  <button
            type="button"
            className="zb-media-button"
            onClick={toggleVoiceRecording}
            disabled={busy}
           aria-label="Record voice">

<svg
  className="zb-composer-action-icon"
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <rect
    x="9"
    y="3"
    width="6"
    height="11"
    rx="3"
    stroke="currentColor"
    strokeWidth="1.8"
  />
  <path
    d="M6.5 11.5v.5a5.5 5.5 0 0 0 11 0v-.5M12 17.5V21M9 21h6"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  />
</svg>
  </button>
</Tooltip>

          <button
            type="button"
            className="zb-import-button"
            onClick={() =>
              setShopifyOpen((current) => !current)
            }
            disabled={busy}
          >
            Import Shopify
          </button>

          <button
            type="submit"
            className="zb-build-button"
            disabled={busy || !canSubmit}
          >
            {busy ? "Planning..." : "Build"}
          </button>
        </div>
      </form>
    </div>
  );
}
