"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";

import type {
  PublicChallengeAudienceContact,
  PublicChallengeAudienceContactsResponse,
  PublicChallengeAudienceList,
  PublicChallengeAudienceListsResponse,
  PublicChallengeEmailImageUploadResponse,
  PublicChallengeEmailPreviewResponse,
  PublicChallengeEmailSendResponse,
  PublicChallengeEmailTestResponse,
  PublicChallengeExerciseOption,
} from "@zoeskoul/api-contracts";
import { adminFetch } from "@/lib/adminApi";
import {
  CHALLENGE_SHARE_IMAGE_HEIGHT,
  CHALLENGE_SHARE_IMAGE_WIDTH,
  challengeScreenshotFilename,
  computeChallengeShareCoverCrop,
  isEligiblePublicChallengeTarget,
} from "@zoeskoul/practice-contracts";
type ShareResponse = {
  ok: true;
  url: string;
  code: string;
  title: string;
  shareTitle: string;
  shareDescription: string;
  imageUrl: string | null;
  exerciseKey: string;
  exerciseKind: string;
  exercisePurpose: "practice";
  expiresAt: string;
  maxAttempts: number | null;
  attemptPolicy: "unlimited";
};

type PreviewResponse = {
  ok: true;
  url: string;
  title: string;
  expiresAt: string;
};

const MAX_PREVIEW_IMAGE_BYTES = 4 * 1024 * 1024;
const PREVIEW_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);


function uniqueBy<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function targetId(target: PublicChallengeExerciseOption) {
  return target.id;
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) throw new Error("Copy was blocked by the browser.");
}

async function readShareResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | (ShareResponse & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok || !body || !("url" in body)) {
    throw new Error(body?.error || "Could not create the challenge link.");
  }

  return body as ShareResponse;
}

async function readPreviewResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | (PreviewResponse & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok || !body || !("url" in body)) {
    throw new Error(body?.error || "Could not create the exercise preview.");
  }

  return body as PreviewResponse;
}

async function readJsonResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok || !body) {
    throw new Error(
      (body && "error" in body && body.error) || fallback,
    );
  }

  return body as T;
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("The browser could not create the screenshot image."));
    }, "image/png");
  });
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-neutral-100"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
      <div className="text-base font-semibold text-neutral-900">
        No published challenge exercises found
      </div>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
        This page only shows generated, seeded, active code-input Practice
        exercises that can run anonymously through the existing practice-trial
        runtime. Run Gen manifests and seed the published course if an exercise
        is missing.
      </p>
    </div>
  );
}

export default function PublicChallengePublisher(props: {
  options: PublicChallengeExerciseOption[];
  initialLocale?: string;
}) {
  const eligibleOptions = useMemo(
    () =>
      props.options.filter(isEligiblePublicChallengeTarget),
    [props.options],
  );
  const first = eligibleOptions[0] ?? null;
  const initialLocale = ["en", "fr", "ht"].includes(props.initialLocale ?? "")
    ? (props.initialLocale as string)
    : "en";
  const [locale, setLocale] = useState(initialLocale);
  const [catalogSlug, setCatalogSlug] = useState(first?.catalogSlug ?? "");
  const [subjectSlug, setSubjectSlug] = useState(first?.subjectSlug ?? "");
  const [moduleSlug, setModuleSlug] = useState(first?.moduleSlug ?? "");
  const [sectionSlug, setSectionSlug] = useState(first?.sectionSlug ?? "");
  const [topicSlug, setTopicSlug] = useState(first?.topicSlug ?? "");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(first?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [result, setResult] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareTitle, setShareTitle] = useState(first?.exerciseTitle ?? "");
  const [shareDescription, setShareDescription] = useState(
    "Can you complete this coding practice challenge? No account is required to try it.",
  );
  const [ogImageAlt, setOgImageAlt] = useState(
    first ? `${first.exerciseTitle} challenge preview` : "",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // ZOESKOUL_PUBLIC_CHALLENGE_BREVO_ADD_ONLY_V77C5
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [audienceConfigured, setAudienceConfigured] =
    useState<boolean | null>(null);
  const [audienceLists, setAudienceLists] =
    useState<PublicChallengeAudienceList[]>([]);
  const [audienceListId, setAudienceListId] = useState<number | null>(null);
  const [audienceContacts, setAudienceContacts] =
    useState<PublicChallengeAudienceContact[]>([]);
  const [audienceCounts, setAudienceCounts] = useState({
    total: 0,
    selectable: 0,
    suppressed: 0,
  });
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(
    () => new Set(),
  );
  const [emailBusy, setEmailBusy] =
    useState<"preview" | "test" | "send" | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  // ZOESKOUL_BREVO_LIST_TEST_RECIPIENT_V77C10
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  // ZOESKOUL_PUBLIC_CHALLENGE_EMAIL_IMAGE_UPLOAD_V77C12B
  const [emailImageUrl, setEmailImageUrl] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] =
    useState<PublicChallengeEmailPreviewResponse | null>(null);
  const [emailSendResult, setEmailSendResult] =
    useState<PublicChallengeEmailSendResponse | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const catalogs = useMemo(
    () => uniqueBy(eligibleOptions, (option) => option.catalogSlug),
    [eligibleOptions],
  );
  const effectiveCatalog = catalogs.some((item) => item.catalogSlug === catalogSlug)
    ? catalogSlug
    : catalogs[0]?.catalogSlug ?? "";

  const subjects = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter((option) => option.catalogSlug === effectiveCatalog),
        (option) => option.subjectSlug,
      ),
    [effectiveCatalog, eligibleOptions],
  );
  const effectiveSubject = subjects.some((item) => item.subjectSlug === subjectSlug)
    ? subjectSlug
    : subjects[0]?.subjectSlug ?? "";

  const modules = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter(
          (option) =>
            option.catalogSlug === effectiveCatalog &&
            option.subjectSlug === effectiveSubject,
        ),
        (option) => option.moduleSlug,
      ),
    [effectiveCatalog, effectiveSubject, eligibleOptions],
  );
  const effectiveModule = modules.some((item) => item.moduleSlug === moduleSlug)
    ? moduleSlug
    : modules[0]?.moduleSlug ?? "";

  const sections = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter(
          (option) =>
            option.catalogSlug === effectiveCatalog &&
            option.subjectSlug === effectiveSubject &&
            option.moduleSlug === effectiveModule,
        ),
        (option) => option.sectionSlug,
      ),
    [effectiveCatalog, effectiveModule, effectiveSubject, eligibleOptions],
  );
  const effectiveSection = sections.some((item) => item.sectionSlug === sectionSlug)
    ? sectionSlug
    : sections[0]?.sectionSlug ?? "";

  const topics = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter(
          (option) =>
            option.catalogSlug === effectiveCatalog &&
            option.subjectSlug === effectiveSubject &&
            option.moduleSlug === effectiveModule &&
            option.sectionSlug === effectiveSection,
        ),
        (option) => option.topicSlug,
      ),
    [
      effectiveCatalog,
      effectiveModule,
      effectiveSection,
      effectiveSubject,
      eligibleOptions,
    ],
  );
  const effectiveTopic = topics.some((item) => item.topicSlug === topicSlug)
    ? topicSlug
    : topics[0]?.topicSlug ?? "";

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return eligibleOptions.filter((option) => {
      if (option.catalogSlug !== effectiveCatalog) return false;
      if (option.subjectSlug !== effectiveSubject) return false;
      if (option.moduleSlug !== effectiveModule) return false;
      if (option.sectionSlug !== effectiveSection) return false;
      if (option.topicSlug !== effectiveTopic) return false;
      if (!normalizedQuery) return true;

      return [option.exerciseTitle, option.exerciseKey, option.exerciseKind]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [
    effectiveCatalog,
    effectiveModule,
    effectiveSection,
    effectiveSubject,
    effectiveTopic,
    eligibleOptions,
    query,
  ]);

  const selected =
    filteredExercises.find((option) => targetId(option) === selectedId) ??
    filteredExercises[0] ??
    null;

  const visibleAudienceContacts = useMemo(() => {
    const term = contactQuery.trim().toLowerCase();
    if (!term) return audienceContacts;

    return audienceContacts.filter((contact) =>
      `${contact.name ?? ""} ${contact.email}`
        .toLowerCase()
        .includes(term),
    );
  }, [audienceContacts, contactQuery]);

  const excludedEmails = useMemo(
    () =>
      audienceContacts
        .filter(
          (contact) =>
            contact.selectable && !selectedEmails.has(contact.email),
        )
        .map((contact) => contact.email),
    [audienceContacts, selectedEmails],
  );

  const selectedRecipientCount = selectedEmails.size;

  useEffect(() => {
    setResult(null);
    setError(null);
    setCopyState("idle");
    setPreviewUrl(null);
    setPreviewExpiresAt(null);
    setEmailError(null);
    setEmailNotice(null);
    setEmailPreview(null);
    setEmailSendResult(null);
  }, [locale, selected?.id]);

  useEffect(() => {
    setShareTitle(selected?.exerciseTitle ?? "");
    setShareDescription(
      "Can you complete this coding practice challenge? No account is required to try it.",
    );
    setOgImageAlt(
      selected ? `${selected.exerciseTitle} challenge preview` : "",
    );
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }, [selected?.id, selected?.exerciseTitle]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  useEffect(() => {
    setEmailImageUrl(null);
  }, [imageFile]);


  useEffect(() => {
    const controller = new AbortController();
    setAudienceLoading(true);

    void adminFetch("/api/admin/public-challenges/audience", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) =>
        readJsonResponse<PublicChallengeAudienceListsResponse>(
          response,
          "Brevo audiences could not be loaded.",
        ),
      )
      .then((payload) => {
        if (controller.signal.aborted) return;

        setAudienceConfigured(payload.configured);
        setAudienceLists(payload.lists);

        const preferred =
          payload.defaultListId &&
          payload.lists.some((list) => list.id === payload.defaultListId)
            ? payload.defaultListId
            : payload.lists[0]?.id ?? null;

        setAudienceListId(preferred);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setAudienceConfigured(false);
        setEmailError(
          cause instanceof Error
            ? cause.message
            : "Brevo audiences could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setAudienceLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!audienceListId || audienceConfigured !== true) {
      setAudienceContacts([]);
      setSelectedEmails(new Set());
      setAudienceCounts({
        total: 0,
        selectable: 0,
        suppressed: 0,
      });
      setTestRecipientEmail("");
      return;
    }

    const controller = new AbortController();
    setAudienceLoading(true);
    setEmailError(null);

    void adminFetch(
      `/api/admin/public-challenges/audience?listId=${encodeURIComponent(
        String(audienceListId),
      )}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then((response) =>
        readJsonResponse<PublicChallengeAudienceContactsResponse>(
          response,
          "Brevo contacts could not be loaded.",
        ),
      )
      .then((payload) => {
        if (controller.signal.aborted) return;

        setAudienceContacts(payload.contacts);
        setAudienceCounts(payload.counts);
        setSelectedEmails(
          new Set(
            payload.contacts
              .filter((contact) => contact.selectable)
              .map((contact) => contact.email),
          ),
        );
        setTestRecipientEmail((current) =>
          payload.contacts.some(
            (contact) =>
              contact.selectable && contact.email === current,
          )
            ? current
            : "",
        );
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setAudienceContacts([]);
        setSelectedEmails(new Set());
        setEmailError(
          cause instanceof Error
            ? cause.message
            : "Brevo contacts could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setAudienceLoading(false);
      });

    return () => controller.abort();
  }, [audienceConfigured, audienceListId]);

  function chooseCatalog(value: string) {
    const next = eligibleOptions.find((option) => option.catalogSlug === value);
    setCatalogSlug(value);
    setSubjectSlug(next?.subjectSlug ?? "");
    setModuleSlug(next?.moduleSlug ?? "");
    setSectionSlug(next?.sectionSlug ?? "");
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseSubject(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog && option.subjectSlug === value,
    );
    setSubjectSlug(value);
    setModuleSlug(next?.moduleSlug ?? "");
    setSectionSlug(next?.sectionSlug ?? "");
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseModule(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog &&
        option.subjectSlug === effectiveSubject &&
        option.moduleSlug === value,
    );
    setModuleSlug(value);
    setSectionSlug(next?.sectionSlug ?? "");
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseSection(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog &&
        option.subjectSlug === effectiveSubject &&
        option.moduleSlug === effectiveModule &&
        option.sectionSlug === value,
    );
    setSectionSlug(value);
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseTopic(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog &&
        option.subjectSlug === effectiveSubject &&
        option.moduleSlug === effectiveModule &&
        option.sectionSlug === effectiveSection &&
        option.topicSlug === value,
    );
    setTopicSlug(value);
    setSelectedId(next?.id ?? "");
  }

  function acceptPreviewImage(file: File | null) {
    if (!file) {
      setImageFile(null);
      return false;
    }

    if (!PREVIEW_IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      setImageFile(null);
      return false;
    }

    if (file.size > MAX_PREVIEW_IMAGE_BYTES) {
      setError("The preview image must be 4 MB or smaller.");
      setImageFile(null);
      return false;
    }

    setError(null);
    setResult(null);
    setImageFile(file);
    return true;
  }

  function choosePreviewImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!acceptPreviewImage(file)) event.target.value = "";
  }

  function removePreviewImage() {
    setImageFile(null);
    setResult(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function createExercisePreview() {
    if (!selected) return null;

    const response = await adminFetch("/api/practice/trial/preview", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale,
        subjectSlug: selected.subjectSlug,
        moduleSlug: selected.moduleSlug,
        sectionSlug: selected.sectionSlug,
        topicSlug: selected.topicSlug,
        exerciseKey: selected.exerciseKey,
      }),
    });

    const created = await readPreviewResponse(response);
    setPreviewUrl(created.url);
    setPreviewExpiresAt(created.expiresAt);
    return created;
  }

  async function openExercisePreview() {
    if (!selected || previewing) return;

    const popup = window.open("", "zoeskoul-challenge-exercise-preview");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Loading ZoeSkoul challenge preview…";
      popup.document.body.textContent = "Loading exercise preview…";
      popup.document.body.style.font = "16px system-ui";
      popup.document.body.style.padding = "32px";
    }

    setPreviewing(true);
    setError(null);

    try {
      const created = await createExercisePreview();
      if (!created) return;

      if (popup && !popup.closed) {
        popup.location.replace(created.url);
      } else {
        setError(
          "The preview link is ready, but the browser blocked the new tab. Allow pop-ups and use Open preview again.",
        );
      }
    } catch (cause) {
      if (popup && !popup.closed) popup.close();
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open the exercise preview.",
      );
    } finally {
      setPreviewing(false);
    }
  }

  function openExistingPreview() {
    if (!previewUrl) return;
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  }

  async function capturePreviewTab() {
    if (!selected || capturing) return;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "This browser cannot capture a tab. Use Paste screenshot or upload an image instead.",
      );
      return;
    }

    setCapturing(true);
    setError(null);
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        video?.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video?.addEventListener(
          "error",
          () => reject(new Error("The selected preview tab could not be read.")),
          { once: true },
        );
      });
      await video.play();
      await nextAnimationFrame();
      await nextAnimationFrame();

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const crop = computeChallengeShareCoverCrop(sourceWidth, sourceHeight);
      const canvas = document.createElement("canvas");
      canvas.width = CHALLENGE_SHARE_IMAGE_WIDTH;
      canvas.height = CHALLENGE_SHARE_IMAGE_HEIGHT;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The browser could not prepare the screenshot.");

      context.drawImage(
        video,
        crop.sourceX,
        crop.sourceY,
        crop.sourceWidth,
        crop.sourceHeight,
        0,
        0,
        CHALLENGE_SHARE_IMAGE_WIDTH,
        CHALLENGE_SHARE_IMAGE_HEIGHT,
      );

      const blob = await canvasToPngBlob(canvas);
      const file = new File(
        [blob],
        challengeScreenshotFilename(selected.exerciseKey),
        { type: "image/png", lastModified: Date.now() },
      );

      if (acceptPreviewImage(file) && imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not capture the exercise preview.",
      );
    } finally {
      video?.pause();
      if (video) video.srcObject = null;
      stream?.getTracks().forEach((track) => track.stop());
      setCapturing(false);
    }
  }

  async function pasteScreenshot() {
    if (!navigator.clipboard?.read) {
      setError(
        "Clipboard image access is unavailable. Upload the screenshot file instead.",
      );
      return;
    }

    setError(null);

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) =>
          PREVIEW_IMAGE_TYPES.has(candidate),
        );
        if (!type) continue;

        const blob = await item.getType(type);
        const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1];
        const file = new File(
          [blob],
          `${challengeScreenshotFilename(selected?.exerciseKey ?? "challenge").replace(/\.png$/, "")}.${extension}`,
          { type, lastModified: Date.now() },
        );
        acceptPreviewImage(file);
        if (imageInputRef.current) imageInputRef.current.value = "";
        return;
      }

      setError("The clipboard does not contain a supported image.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read an image from the clipboard.",
      );
    }
  }

  function handlePreviewImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (acceptPreviewImage(file) && imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function toggleRecipient(
    contact: PublicChallengeAudienceContact,
  ) {
    if (!contact.selectable) return;

    setSelectedEmails((current) => {
      const next = new Set(current);
      if (next.has(contact.email)) next.delete(contact.email);
      else next.add(contact.email);
      return next;
    });
  }

  function selectAllRecipients() {
    setSelectedEmails(
      new Set(
        audienceContacts
          .filter((contact) => contact.selectable)
          .map((contact) => contact.email),
      ),
    );
  }

  function clearRecipients() {
    setSelectedEmails(new Set());
  }

  async function ensurePreviewUrl() {
    if (result?.url) return result.url;
    if (previewUrl) return previewUrl;

    const created = await createExercisePreview();
    if (!created) {
      throw new Error("Could not prepare a challenge preview.");
    }

    return created.url;
  }

  async function ensureEmailImageUrl() {
    if (result?.imageUrl) return result.imageUrl;
    if (!imageFile) return null;
    if (emailImageUrl) return emailImageUrl;

    const form = new FormData();
    form.set("image", imageFile, imageFile.name);

    const response = await adminFetch(
      "/api/admin/public-challenges/email-image",
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: form,
      },
    );

    const uploaded =
      await readJsonResponse<PublicChallengeEmailImageUploadResponse>(
        response,
        "The email preview image could not be uploaded.",
      );

    setEmailImageUrl(uploaded.imageUrl);
    return uploaded.imageUrl;
  }

  function emailPayload(
    challengeUrl: string,
    imageUrl?: string | null,
  ) {
    return {
      sourceListId: audienceListId ?? undefined,
      excludedEmails,
      challengeUrl,
      imageUrl: imageUrl ?? null,
      title:
        shareTitle.trim() ||
        selected?.exerciseTitle ||
        "ZoeSkoul challenge",
      description: shareDescription.trim(),
    };
  }

  async function previewChallengeEmail() {
    if (!selected || emailBusy) return;

    setEmailBusy("preview");
    setEmailError(null);
    setEmailNotice(null);

    try {
      const challengeUrl = await ensurePreviewUrl();
      const imageUrl = await ensureEmailImageUrl();
      const response = await adminFetch(
        "/api/admin/public-challenges/email",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            ...emailPayload(challengeUrl, imageUrl),
          }),
        },
      );

      setEmailPreview(
        await readJsonResponse<PublicChallengeEmailPreviewResponse>(
          response,
          "The email preview could not be generated.",
        ),
      );
    } catch (cause) {
      setEmailError(
        cause instanceof Error
          ? cause.message
          : "The email preview could not be generated.",
      );
    } finally {
      setEmailBusy(null);
    }
  }

  async function sendChallengeEmailTest() {
    if (
      !selected ||
      !audienceListId ||
      !testRecipientEmail ||
      emailBusy
    ) {
      return;
    }

    setEmailBusy("test");
    setEmailError(null);
    setEmailNotice(null);

    try {
      const challengeUrl = await ensurePreviewUrl();
      const imageUrl = await ensureEmailImageUrl();
      const response = await adminFetch(
        "/api/admin/public-challenges/email",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "test",
            testEmail: testRecipientEmail,
            ...emailPayload(challengeUrl, imageUrl),
          }),
        },
      );

      const sent =
        await readJsonResponse<PublicChallengeEmailTestResponse>(
          response,
          "The test email could not be sent.",
        );

      setEmailNotice(`Test email sent to ${sent.testEmail}.`);
    } catch (cause) {
      setEmailError(
        cause instanceof Error
          ? cause.message
          : "The test email could not be sent.",
      );
    } finally {
      setEmailBusy(null);
    }
  }

  async function sendChallengeAnnouncement(created: ShareResponse) {
    if (!audienceListId) {
      throw new Error("Choose a Brevo audience list.");
    }
    if (selectedRecipientCount <= 0) {
      throw new Error("Select at least one available Brevo contact.");
    }

    setEmailBusy("send");
    setEmailError(null);
    setEmailNotice(null);

    try {
      const response = await adminFetch(
        "/api/admin/public-challenges/email",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            ...emailPayload(created.url, created.imageUrl),
          }),
        },
      );

      const sent =
        await readJsonResponse<PublicChallengeEmailSendResponse>(
          response,
          "The challenge was created, but its email campaign could not be sent.",
        );

      setEmailSendResult(sent);
      setEmailNotice(
        `Campaign ${sent.campaignId} queued for ${sent.selectedCount} recipient${
          sent.selectedCount === 1 ? "" : "s"
        }.`,
      );
    } finally {
      setEmailBusy(null);
    }
  }

  async function retryChallengeAnnouncement() {
    if (!result || emailBusy) return;

    try {
      await sendChallengeAnnouncement(result);
    } catch (cause) {
      setEmailError(
        cause instanceof Error
          ? cause.message
          : "The challenge email could not be sent.",
      );
    }
  }

  async function createLink() {
    if (!selected) return;

    if (emailEnabled) {
      if (!audienceListId) {
        setEmailError("Choose a Brevo audience list.");
        return;
      }
      if (selectedRecipientCount <= 0) {
        setEmailError("Select at least one available Brevo contact.");
        return;
      }
    }

    setCreating(true);
    setError(null);
    setCopyState("idle");

    try {
      const form = new FormData();
      form.set("locale", locale);
      form.set("subjectSlug", selected.subjectSlug);
      form.set("moduleSlug", selected.moduleSlug);
      form.set("sectionSlug", selected.sectionSlug);
      form.set("topicSlug", selected.topicSlug);
      form.set("exerciseKey", selected.exerciseKey);

      if (shareTitle.trim()) form.set("shareTitle", shareTitle.trim());
      if (shareDescription.trim()) {
        form.set("shareDescription", shareDescription.trim());
      }
      if (imageFile) {
        form.set("image", imageFile, imageFile.name);
        if (ogImageAlt.trim()) form.set("ogImageAlt", ogImageAlt.trim());
      }

      const response = await adminFetch("/api/practice/trial/share", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: form,
      });

      const created = await readShareResponse(response);
      setResult(created);

      setEmailError(null);
      setEmailNotice(null);
      setEmailSendResult(null);

      if (emailEnabled) {
        try {
          await sendChallengeAnnouncement(created);
        } catch (cause) {
          setEmailError(
            cause instanceof Error
              ? cause.message
              : "The challenge was created, but its email campaign could not be sent.",
          );
        }
      }

      try {
        await writeClipboard(created.url);
        setCopyState("copied");
      } catch {
        setCopyState("idle");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the challenge link.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!result) return;

    try {
      await writeClipboard(result.url);
      setCopyState("copied");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not copy the link.");
    }
  }

  async function shareLink() {
    if (!result) return;

    const data = {
      title: result.shareTitle || result.title || "ZoeSkoul challenge",
      text: result.shareDescription,
      url: result.url,
    };

    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
      }
    }

    await copyLink();
  }

  if (!eligibleOptions.length) return <EmptyState />;

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Challenge language"
            value={locale}
            onChange={setLocale}
            options={[
              { value: "en", label: "English" },
              { value: "fr", label: "French" },
              { value: "ht", label: "Haitian Creole" },
            ]}
          />
          <SelectField
            label="Catalog"
            value={effectiveCatalog}
            onChange={chooseCatalog}
            options={catalogs.map((item) => ({
              value: item.catalogSlug,
              label: item.catalogTitle,
            }))}
          />
          <SelectField
            label="Published course"
            value={effectiveSubject}
            onChange={chooseSubject}
            options={subjects.map((item) => ({
              value: item.subjectSlug,
              label: `${item.subjectTitle}${
                item.releaseStatus === "legacy" ? " · legacy" : ""
              }`,
            }))}
          />
          <SelectField
            label="Module"
            value={effectiveModule}
            onChange={chooseModule}
            options={modules.map((item) => ({
              value: item.moduleSlug,
              label: item.moduleTitle,
            }))}
          />
          <SelectField
            label="Section"
            value={effectiveSection}
            onChange={chooseSection}
            options={sections.map((item) => ({
              value: item.sectionSlug,
              label: item.sectionTitle,
            }))}
          />
          <SelectField
            label="Topic"
            value={effectiveTopic}
            onChange={chooseTopic}
            options={topics.map((item) => ({
              value: item.topicSlug,
              label: item.topicTitle,
            }))}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                Select the exact published exercise
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Only authored code-input Practice exercises are eligible for public
                challenge links.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search exercise ID or title"
                className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-72"
              />
            </div>
          </div>
        </div>

        <div className="max-h-[440px] overflow-auto">
          {filteredExercises.length ? (
            <div className="divide-y divide-neutral-200">
              {filteredExercises.map((option) => {
                const active = selected?.id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedId(option.id)}
                    className={`grid w-full gap-2 px-5 py-4 text-left transition md:grid-cols-[minmax(0,1fr)_140px_140px] md:items-center ${
                      active ? "bg-indigo-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-950">
                        {option.exerciseTitle}
                      </span>
                      <span className="mt-1 block truncate font-mono text-xs text-neutral-500">
                        {option.exerciseKey}
                      </span>
                    </span>
                    <span className="w-fit rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                      {option.exerciseKind}
                    </span>
                    <span className="w-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      {option.exercisePurpose}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-neutral-600">
              No exercises match this topic and filter.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Preview before publishing
            </div>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">
              Open the real exercise and capture its IDE
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              This creates a temporary 15-minute preview only. It does not create a
              public challenge-link record. Arrange the IDE in the preview tab, then
              capture that tab into an exact 1200 × 630 social image.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void openExercisePreview()}
              disabled={!selected || previewing}
              className="min-h-11 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {previewing ? "Opening…" : "Open live exercise preview"}
            </button>
            {previewUrl ? (
              <button
                type="button"
                onClick={openExistingPreview}
                className="min-h-11 rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-50"
              >
                Open preview again
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <ol className="grid gap-2 text-sm leading-6 text-neutral-700">
              <li>
                <span className="font-semibold">1.</span> Open the live preview and
                wait for the IDE to finish loading.
              </li>
              <li>
                <span className="font-semibold">2.</span> Select the file and layout
                you want people to see.
              </li>
              <li>
                <span className="font-semibold">3.</span> Click Capture preview tab
                and choose that browser tab in the browser picker.
              </li>
            </ol>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void capturePreviewTab()}
                disabled={!selected || !previewUrl || capturing}
                className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {capturing ? "Capturing…" : "Capture preview tab"}
              </button>
              <button
                type="button"
                onClick={() => void pasteScreenshot()}
                disabled={!selected}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Paste screenshot
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Chrome and Edge can capture a tab directly. Safari or restricted
              browsers can use a normal macOS screenshot and Paste screenshot, or the
              upload field below.
            </p>
            {previewExpiresAt ? (
              <p className="mt-2 text-xs text-sky-800">
                Temporary preview expires {new Date(previewExpiresAt).toLocaleTimeString()}.
              </p>
            ) : null}
          </div>

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={handlePreviewImageDrop}
            className={`flex min-h-48 items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition ${
              dragActive
                ? "border-sky-500 bg-sky-100"
                : "border-sky-200 bg-white"
            }`}
          >
            <div>
              <div className="text-sm font-semibold text-neutral-900">
                {imageFile ? imageFile.name : "Drop an IDE screenshot here"}
              </div>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Captured, pasted, dropped, and uploaded images all use the same
                Cloudinary upload when the link is created.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">
            Facebook and social preview
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            These values become the Open Graph and Twitter metadata for the short
            challenge link. The uploaded file is stored in Cloudinary; Prisma stores
            only its public ID and text metadata.
          </p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
              <span>Share title</span>
              <input
                value={shareTitle}
                onChange={(event) => setShareTitle(event.target.value)}
                maxLength={100}
                placeholder={selected?.exerciseTitle ?? "Challenge title"}
                className="min-h-11 rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
              <span>Share description</span>
              <textarea
                value={shareDescription}
                onChange={(event) => setShareDescription(event.target.value)}
                maxLength={240}
                rows={3}
                className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="grid gap-2">
              <label
                htmlFor="challenge-preview-image"
                className="text-sm font-medium text-neutral-800"
              >
                Preview image (captured or uploaded)
              </label>
              <input
                ref={imageInputRef}
                id="challenge-preview-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={choosePreviewImage}
                className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700"
              />
              <p className="text-xs leading-5 text-neutral-500">
                Capture creates 1200 × 630 automatically. Uploads may be JPEG,
                PNG, or WebP up to 4 MB.
              </p>
              {imageFile ? (
                <button
                  type="button"
                  onClick={removePreviewImage}
                  className="w-fit rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Remove image
                </button>
              ) : null}
            </div>

            <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
              <span>Image alt text</span>
              <input
                value={ogImageAlt}
                onChange={(event) => setOgImageAlt(event.target.value)}
                maxLength={160}
                disabled={!imageFile}
                className="min-h-11 rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-neutral-100"
              />
            </label>
          </div>

          <div>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm">
              <div
                className="aspect-[1200/630] bg-cover bg-center"
                style={
                  imagePreviewUrl
                    ? { backgroundImage: `url("${imagePreviewUrl}")` }
                    : undefined
                }
                role={imagePreviewUrl ? "img" : undefined}
                aria-label={imagePreviewUrl ? ogImageAlt || "Challenge preview" : undefined}
              >
                {!imagePreviewUrl ? (
                  <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">
                    The default ZoeSkoul social image will be used.
                  </div>
                ) : null}
              </div>
              <div className="border-t border-neutral-200 bg-white p-4">
                <div className="truncate text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  zoeskoul.com
                </div>
                <div className="mt-1 line-clamp-2 text-sm font-semibold text-neutral-950">
                  {shareTitle || selected?.exerciseTitle || "ZoeSkoul challenge"}
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-600">
                  {shareDescription}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="challenge-email-addon">
        <div className="challenge-email-addon__header">
          <div>
            <span className="challenge-email-addon__eyebrow">
              Email announcement
            </span>
            <h3>Send this challenge through Brevo</h3>
            <p>
              Uses your Brevo lists directly, including contacts you added
              manually. Unsubscribed or blacklisted contacts stay suppressed.
            </p>
          </div>

          <label className="challenge-email-addon__toggle">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(event) => {
                setEmailEnabled(event.target.checked);
                setEmailError(null);
              }}
              disabled={audienceConfigured !== true}
            />
            <span>Send by email</span>
          </label>
        </div>

        {audienceConfigured === false ? (
          <div className="notice">
            Brevo audiences are unavailable in this environment. You can still
            create and share the challenge normally.
          </div>
        ) : null}

        <div className="challenge-email-addon__grid">
          <label>
            <span>Brevo list</span>
            <select
              value={audienceListId ?? ""}
              onChange={(event) =>
                setAudienceListId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              disabled={audienceLoading || !audienceLists.length}
            >
              {audienceLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}{list.isDefault ? " · default" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="challenge-email-addon__summary">
            <span>{audienceLoading ? "Loading contacts…" : "Audience"}</span>
            <strong>
              {audienceCounts.selectable} available
              {audienceCounts.suppressed
                ? ` · ${audienceCounts.suppressed} suppressed`
                : ""}
            </strong>
            <small>
              {selectedRecipientCount} selected
              {excludedEmails.length
                ? ` · ${excludedEmails.length} deselected`
                : ""}
            </small>
          </div>
        </div>

        {audienceConfigured === true && audienceListId ? (
          <>
            <div className="challenge-email-addon__toolbar">
              <input
                value={contactQuery}
                onChange={(event) => setContactQuery(event.target.value)}
                placeholder="Search Brevo contacts"
                aria-label="Search Brevo contacts"
              />
              <button
                type="button"
                onClick={selectAllRecipients}
                disabled={audienceLoading}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearRecipients}
                disabled={audienceLoading}
              >
                Clear
              </button>
            </div>

            <div className="challenge-email-addon__contacts">
              {visibleAudienceContacts.length ? (
                visibleAudienceContacts.map((contact) => (
                  <label
                    key={contact.email}
                    className={
                      contact.selectable
                        ? "challenge-email-addon__contact"
                        : "challenge-email-addon__contact is-suppressed"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmails.has(contact.email)}
                      onChange={() => toggleRecipient(contact)}
                      disabled={!contact.selectable}
                    />

                    <span>
                      <strong>{contact.name || contact.email}</strong>
                      {contact.name ? <small>{contact.email}</small> : null}
                    </span>

                    {contact.suppressionReason ? (
                      <em>
                        {contact.suppressionReason === "blacklisted"
                          ? "Blacklisted"
                          : contact.suppressionReason === "unsubscribed"
                            ? "Unsubscribed"
                            : "Invalid email"}
                      </em>
                    ) : null}
                  </label>
                ))
              ) : (
                <div className="challenge-email-addon__empty">
                  {audienceLoading
                    ? "Loading contacts…"
                    : "No contacts match this search."}
                </div>
              )}
            </div>
          </>
        ) : null}

        <label className="challenge-email-addon__test-recipient">
          <span>Test recipient</span>
          <select
            value={testRecipientEmail}
            onChange={(event) => {
              setTestRecipientEmail(event.target.value);
              setEmailError(null);
            }}
            disabled={audienceLoading || audienceConfigured !== true}
          >
            <option value="">Choose a contact from this Brevo list</option>
            {audienceContacts
              .filter((contact) => contact.selectable)
              .map((contact) => (
                <option key={contact.email} value={contact.email}>
                  {contact.name
                    ? `${contact.name} · ${contact.email}`
                    : contact.email}
                </option>
              ))}
          </select>
          <small>
            Brevo only allows test sends to an existing, non-blacklisted
            contact in a contact list.
          </small>
        </label>

        <div className="challenge-email-addon__actions">
          <button
            type="button"
            onClick={() => void previewChallengeEmail()}
            disabled={!selected || emailBusy != null}
          >
            {emailBusy === "preview" ? "Preparing…" : "Preview email"}
          </button>

          <button
            type="button"
            onClick={() => void sendChallengeEmailTest()}
            disabled={
              !selected ||
              !audienceListId ||
              !testRecipientEmail ||
              audienceConfigured !== true ||
              emailBusy != null
            }
          >
            {emailBusy === "test" ? "Sending…" : "Send test"}
          </button>
        </div>

        {emailPreview ? (
          <div className="challenge-email-addon__preview">
            <div>
              <strong>{emailPreview.subject}</strong>
              <button
                type="button"
                onClick={() => setEmailPreview(null)}
              >
                Close preview
              </button>
            </div>
            <iframe
              title="Challenge email preview"
              srcDoc={emailPreview.html}
            />
          </div>
        ) : null}

        {emailError ? (
          <div className="notice notice-error" role="alert">
            {emailError}
            {result && emailEnabled && !emailSendResult ? (
              <button
                type="button"
                onClick={() => void retryChallengeAnnouncement()}
                disabled={emailBusy != null}
              >
                Retry email
              </button>
            ) : null}
          </div>
        ) : null}

        {emailNotice ? (
          <div className="notice challenge-email-addon__success">
            {emailNotice}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Selected public challenge
            </div>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">
              {selected?.exerciseTitle ?? "Select an exercise"}
            </h2>
            {selected ? (
              <div className="mt-3 grid gap-1 text-sm text-neutral-700">
                <div>
                  <span className="font-semibold">Purpose:</span>{" "}
                  {selected.exercisePurpose}
                </div>
                <div>
                  <span className="font-semibold">Kind:</span>{" "}
                  {selected.exerciseKind}
                </div>
                <div className="break-all font-mono text-xs text-neutral-600">
                  {selected.subjectSlug} / {selected.moduleSlug} /{" "}
                  {selected.sectionSlug} / {selected.topicSlug} /{" "}
                  {selected.exerciseKey}
                </div>
              </div>
            ) : null}
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              The guest receives only this exercise and may keep submitting until
              it is solved or revealed. Run, editing, and refresh do not consume
              attempts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void createLink()}
            disabled={!selected || creating}
            className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? "Creating…" : "Create and copy challenge link"}
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <label
              className="block text-sm font-semibold text-emerald-950"
              htmlFor="published-challenge-link"
            >
              Public challenge link
            </label>
            <input
              id="published-challenge-link"
              value={result.url}
              readOnly
              className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-neutral-900"
            />
            {result.imageUrl ? (
              <div
                className="mt-3 aspect-[1200/630] max-w-xl rounded-xl bg-cover bg-center shadow-sm"
                style={{ backgroundImage: `url("${result.imageUrl}")` }}
                role="img"
                aria-label={ogImageAlt || result.shareTitle}
              />
            ) : null}
            <p className="mt-2 font-mono text-xs text-emerald-800">
              Short code: {result.code}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
              >
                {copyState === "copied" ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => void shareLink()}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800"
              >
                Share
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800"
              >
                Open guest preview
              </a>
            </div>
            <p className="mt-3 text-xs text-emerald-800">
              Expires {new Date(result.expiresAt).toLocaleDateString()} ·{" "}
              Unlimited graded attempts
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
