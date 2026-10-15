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

    const prompt = value.trim();
    if (!prompt && files.length === 0) return;

    setBusy(true);
    setPromptError(null);

    try {
      await props.onPrompt({
        prompt,
        files,
      });
    } catch (error) {
      setPromptError(
        error instanceof Error
          ? error.message
          : "Zoé could not process this request.",
      );
    } finally {
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
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
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

        {promptError ? (
          <div
            className="zb-composer-error"
            role="alert"
          >
            {promptError}
          </div>
        ) : null}

        <div className="zb-composer-actions">
          <input
            ref={mediaInputRef}
            className="zb-media-input"
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            onChange={chooseMedia}
            aria-label="Upload image, video, or audio"
          />

          <button
            type="button"
            className="zb-media-button"
            onClick={() => mediaInputRef.current?.click()}
            disabled={busy}
          >
            Add media
          </button>

          <button
            type="button"
            className="zb-media-button"
            onClick={toggleVoiceRecording}
            disabled={busy}
          >
            {recording ? "Stop voice" : "Record voice"}
          </button>

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
