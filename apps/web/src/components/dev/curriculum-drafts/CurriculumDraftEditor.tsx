"use client";

import { useEffect, useMemo, useState } from "react";
import DiagnosticsPanel from "./DiagnosticsPanel";
import ExerciseTable from "./ExerciseTable";
import ExerciseJsonEditor from "./ExerciseJsonEditor";
import ExerciseMessageEditor from "./ExerciseMessageEditor";
import { keepEditorSelection } from "./editorSelection";
import FilePairEditor from "./FilePairEditor";
import JsonEditor from "./JsonEditor";
import ProjectFlowPanel from "./ProjectFlowPanel";
import SketchesEditor from "./SketchesEditor";
import type { DraftCatalogSummary, DraftListDebug, DraftModuleSummary, DraftSubjectSummary, DraftTopicSummary, LoadedTopic } from "./types";

type TabKey = "overview" | "bundle" | "messages" | "sketches" | "exercises" | "files" | "project" | "validation";

type JsonObject = Record<string, unknown>;
type FileSide = "starter" | "solution";

type CommandResult = {
  ok?: boolean;
  command?: string;
  exitCode?: number | null;
  output?: string;
  error?: string;
};

type BackupResult = {
  ok?: boolean;
  backup?: {
    backupRoot: string;
    paths: string[];
  };
  error?: string;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "bundle", label: "Bundle JSON" },
  { key: "messages", label: "Messages JSON" },
  { key: "sketches", label: "Sketches" },
  { key: "exercises", label: "Exercises" },
  { key: "files", label: "Starter/Solution" },
  { key: "project", label: "Project Flow" },
  { key: "validation", label: "Validation" },
];

function jsonPretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

function exerciseId(value: unknown) {
  const object = asObject(value);
  return typeof object?.id === "string" ? object.id : null;
}

function cleanRouteSegment(value: unknown, fallback = "item") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  return raw
    .replace(/\./g, "-")
    .replace(/_/g, "-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || fallback;
}

function lastIdSegment(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const parts = raw.split(/[.:/]/).filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

function subjectForGeneratedPreview(catalog: string, subject: string) {
  const prefix = `${catalog}--`;
  const suffix = "--draft";
  if (subject.startsWith(prefix) && subject.endsWith(suffix)) {
    return subject.slice(prefix.length, -suffix.length);
  }
  return subject.replace(/--draft$/, "");
}

function sectionForGeneratedPreview(catalog: string, subject: string, sectionSlug: string) {
  const generatedSubject = subjectForGeneratedPreview(catalog, subject);
  if (subject !== generatedSubject && sectionSlug.startsWith(`${subject}-`)) {
    return `${generatedSubject}-${sectionSlug.slice(subject.length + 1)}`;
  }
  return sectionSlug;
}

function cardTargetKind(card: JsonObject) {
  const kind = typeof card.kind === "string" ? card.kind : typeof card.type === "string" ? card.type : "card";
  return ["sketch", "quiz", "project", "text", "video"].includes(kind) ? kind : "card";
}

function cardTargetSlug(card: JsonObject) {
  if (cardTargetKind(card) === "sketch") {
    return cleanRouteSegment(lastIdSegment(card.sketchId), cleanRouteSegment(card.id, "sketch"));
  }
  return cleanRouteSegment(card.id, "card");
}

function previewTargetFromBundle(bundleJson: unknown, selectedExerciseId: string | null) {
  const bundle = asObject(bundleJson);
  if (!bundle) throw new Error("Bundle JSON must be an object before previewing.");

  const topicId = typeof bundle.topicId === "string" && bundle.topicId.trim() ? bundle.topicId.trim() : "topic";
  const topicSlug = cleanRouteSegment(topicId, "topic");
  const sectionSlug = typeof bundle.sectionSlug === "string" && bundle.sectionSlug.trim()
    ? bundle.sectionSlug.trim()
    : "general";

  const cards = Array.isArray(bundle.cards) ? bundle.cards : [];

  if (selectedExerciseId) {
    for (const rawCard of cards) {
      const card = asObject(rawCard);
      if (!card) continue;
      const tryIt = asObject(card.tryIt);
      if (tryIt?.exerciseKey === selectedExerciseId || tryIt?.id === selectedExerciseId) {
        return { sectionSlug, topicSlug, targetKind: cardTargetKind(card), targetSlug: cardTargetSlug(card) };
      }
    }

    for (const rawCard of cards) {
      const card = asObject(rawCard);
      if (!card) continue;
      const project = asObject(card.project) ?? asObject(card.moduleProject) ?? asObject(card.capstone) ?? asObject(card.spec);
      const steps = Array.isArray(project?.steps) ? project.steps : [];
      for (const step of steps) {
        const stepObject = asObject(step);
        if (!stepObject) continue;
        const exerciseKey = typeof stepObject.exerciseKey === "string" ? stepObject.exerciseKey : typeof stepObject.id === "string" ? stepObject.id : "";
        if (exerciseKey !== selectedExerciseId) continue;
        return {
          sectionSlug,
          topicSlug,
          targetKind: "exercise",
          targetSlug: cleanRouteSegment(typeof stepObject.id === "string" ? stepObject.id : selectedExerciseId, "exercise"),
        };
      }
    }

    const exercise = Array.isArray(bundle.exercises)
      ? bundle.exercises.map(asObject).find((candidate) => candidate?.id === selectedExerciseId)
      : null;
    if (exercise?.purpose === "quiz") {
      const quizCard = cards.map(asObject).find((card) => card && cardTargetKind(card) === "quiz");
      if (quizCard) return { sectionSlug, topicSlug, targetKind: "quiz", targetSlug: cardTargetSlug(quizCard) };
    }
  }

  const firstCard = cards.map(asObject).find(Boolean);
  if (!firstCard) throw new Error("Bundle has no cards to preview.");
  return { sectionSlug, topicSlug, targetKind: cardTargetKind(firstCard), targetSlug: cardTargetSlug(firstCard) };
}

function sketchId(value: unknown) {
  const object = asObject(value);
  return typeof object?.id === "string" ? object.id : null;
}

function replaceSketchInBundle(bundleJson: unknown, sketchIdToReplace: string, nextSketch: unknown) {
  const bundle = asObject(bundleJson);
  if (!bundle || !Array.isArray(bundle.sketches)) throw new Error("Bundle JSON does not contain a sketches array.");

  let replaced = false;
  const sketches = bundle.sketches.map((sketch) => {
    if (sketchId(sketch) !== sketchIdToReplace) return sketch;
    replaced = true;
    return nextSketch;
  });

  if (!replaced) throw new Error(`Sketch not found in bundle: ${sketchIdToReplace}`);
  return { ...bundle, sketches };
}

function replaceExerciseInBundle(bundleJson: unknown, exerciseIdToReplace: string, nextExercise: unknown) {
  const bundle = asObject(bundleJson);
  if (!bundle || !Array.isArray(bundle.exercises)) throw new Error("Bundle JSON does not contain an exercises array.");

  let replaced = false;
  const exercises = bundle.exercises.map((exercise) => {
    if (exerciseId(exercise) !== exerciseIdToReplace) return exercise;
    replaced = true;
    return nextExercise;
  });

  if (!replaced) throw new Error(`Exercise not found in bundle: ${exerciseIdToReplace}`);
  return { ...bundle, exercises };
}

function updateExerciseFileContentInBundle(bundleJson: unknown, exerciseIdToUpdate: string, filePath: string, side: FileSide, content: string) {
  const field = side === "starter" ? "starterFiles" : "solutionFiles";
  const bundle = asObject(bundleJson);
  if (!bundle || !Array.isArray(bundle.exercises)) throw new Error("Bundle JSON does not contain an exercises array.");

  let updated = false;
  const exercises = bundle.exercises.map((exercise) => {
    const object = asObject(exercise);
    if (!object || exerciseId(object) !== exerciseIdToUpdate) return exercise;

    const updateFiles = (files: unknown) => {
      if (!Array.isArray(files)) return files;
      return files.map((file) => {
        const fileObject = asObject(file);
        if (!fileObject || fileObject.path !== filePath) return file;
        updated = true;
        return { ...fileObject, content };
      });
    };

    if (Array.isArray(object[field])) {
      return { ...object, [field]: updateFiles(object[field]) };
    }

    const recipe = asObject(object.recipe);
    if (recipe && Array.isArray(recipe[field])) {
      return { ...object, recipe: { ...recipe, [field]: updateFiles(recipe[field]) } };
    }

    return exercise;
  });

  if (!updated) throw new Error(`Could not find ${side} file ${filePath} in ${exerciseIdToUpdate}.`);
  return { ...bundle, exercises };
}

function parseJsonOrError(text: string) {
  try {
    return { value: JSON.parse(text) as unknown, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed with status ${response.status}`);
  return body;
}

export default function CurriculumDraftEditor() {
  const [catalogs, setCatalogs] = useState<DraftCatalogSummary[]>([]);
  const [listDebug, setListDebug] = useState<DraftListDebug | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");
  const [loadedTopic, setLoadedTopic] = useState<LoadedTopic | null>(null);
  const [bundleText, setBundleText] = useState("{}");
  const [messagesText, setMessagesText] = useState("{}");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [selectedSketchId, setSelectedSketchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/dev/curriculum-drafts/list?locale=en", { cache: "no-store" });
        const body = await readJsonResponse<{ catalogs: DraftCatalogSummary[]; debug?: DraftListDebug }>(response);
        if (cancelled) return;
        setCatalogs(body.catalogs);
        setListDebug(body.debug ?? null);
        const firstCatalog = body.catalogs[0];
        const firstSubject = firstCatalog?.subjects[0];
        const firstModule = firstSubject?.modules[0];
        const firstTopic = firstModule?.topics[0];
        if (firstCatalog && !selectedCatalog) setSelectedCatalog(firstCatalog.catalog);
        if (firstSubject && !selectedSubject) setSelectedSubject(firstSubject.subject);
        if (firstModule && !selectedModule) setSelectedModule(firstModule.moduleDir);
        if (firstTopic && !selectedTopic) setSelectedTopic(firstTopic.topicDir);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load draft list");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedCatalog, selectedModule, selectedSubject, selectedTopic]);

  const selectedCatalogData = useMemo(
    () => catalogs.find((catalog) => catalog.catalog === selectedCatalog) ?? null,
    [catalogs, selectedCatalog],
  );
  const selectedSubjectData = useMemo(
    () => selectedCatalogData?.subjects.find((subject) => subject.subject === selectedSubject) ?? null,
    [selectedCatalogData, selectedSubject],
  );
  const selectedModuleData = useMemo(
    () => selectedSubjectData?.modules.find((module) => module.moduleDir === selectedModule || module.moduleSlug === selectedModule) ?? null,
    [selectedSubjectData, selectedModule],
  );

  const filteredTopics = useMemo(() => {
    const topics = selectedModuleData?.topics ?? [];
    if (!search.trim()) return topics;
    const needle = search.toLowerCase();
    return topics.filter((topic) =>
      [topic.topicDir, topic.topicId, topic.title, topic.topicSlug].some((value) => String(value ?? "").toLowerCase().includes(needle)),
    );
  }, [search, selectedModuleData]);

  const bundleParse = useMemo(() => parseJsonOrError(bundleText), [bundleText]);
  const messagesParse = useMemo(() => parseJsonOrError(messagesText), [messagesText]);
  const dirtyBundle = loadedTopic ? bundleText !== jsonPretty(loadedTopic.bundleJson) : false;
  const dirtyMessages = loadedTopic ? messagesText !== jsonPretty(loadedTopic.messagesJson ?? {}) : false;
  const selectCatalog = (value: string) => {
    const catalog = catalogs.find((item) => item.catalog === value);
    const subject = catalog?.subjects[0];
    const module = subject?.modules[0];
    const topic = module?.topics[0];
    setSelectedCatalog(value);
    setSelectedSubject(subject?.subject ?? "");
    setSelectedModule(module?.moduleDir ?? "");
    setSelectedTopic(topic?.topicDir ?? "");
    setLoadedTopic(null);
  };

  const selectSubject = (value: string) => {
    const subject = selectedCatalogData?.subjects.find((item) => item.subject === value);
    const module = subject?.modules[0];
    const topic = module?.topics[0];
    setSelectedSubject(value);
    setSelectedModule(module?.moduleDir ?? "");
    setSelectedTopic(topic?.topicDir ?? "");
    setLoadedTopic(null);
  };

  const selectModule = (value: string) => {
    const module = selectedSubjectData?.modules.find((item) => item.moduleDir === value);
    const topic = module?.topics[0];
    setSelectedModule(value);
    setSelectedTopic(topic?.topicDir ?? "");
    setLoadedTopic(null);
  };

  const loadTopic = async (
    topicOverride?: DraftTopicSummary,
    options: { preserveEditorSelection?: boolean } = {},
  ) => {
    if (!selectedCatalog || !selectedSubject || !selectedModule || !(topicOverride?.topicDir || selectedTopic)) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const params = new URLSearchParams({
        catalog: selectedCatalog,
        subject: selectedSubject,
        module: selectedModule,
        topic: topicOverride?.topicDir ?? selectedTopic,
        locale: "en",
      });
      const response = await fetch(`/api/dev/curriculum-drafts/topic?${params.toString()}`, { cache: "no-store" });
      const topic = await readJsonResponse<LoadedTopic>(response);
      setLoadedTopic(topic);
      setBundleText(jsonPretty(topic.bundleJson));
      setMessagesText(jsonPretty(topic.messagesJson ?? {}));
      setSelectedTopic(topic.topicDir);

      const exerciseIds = topic.exercises.map((exercise) => exercise.id);
      const defaultExerciseId = topic.exercises.find((exercise) => exercise.kind === "code_input")?.id ?? exerciseIds[0] ?? null;
      setSelectedExerciseId((current) =>
        options.preserveEditorSelection
          ? keepEditorSelection(current, exerciseIds, defaultExerciseId)
          : defaultExerciseId,
      );

      const bundle = asObject(topic.bundleJson);
      const sketchIds = Array.isArray(bundle?.sketches)
        ? bundle.sketches.map(sketchId).filter((id): id is string => Boolean(id))
        : [];
      setSelectedSketchId((current) =>
        options.preserveEditorSelection
          ? keepEditorSelection(current, sketchIds, sketchIds[0] ?? null)
          : sketchIds[0] ?? null,
      );

      setStatus(`Loaded ${topic.paths.bundle}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load topic");
    } finally {
      setLoading(false);
    }
  };

  const reloadCurrentTopic = () => loadTopic(undefined, { preserveEditorSelection: true });

  const saveBundle = async () => {
    if (!loadedTopic) return;
    if (bundleParse.error) {
      setError(bundleParse.error);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/curriculum-drafts/topic/bundle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...loadedTopic, module: loadedTopic.moduleDir, topic: loadedTopic.topicDir, bundleJson: bundleParse.value }),
      });
      await readJsonResponse(response);
      await reloadCurrentTopic();
      setStatus("Saved topic.bundle.json directly to the draft.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save bundle");
    } finally {
      setLoading(false);
    }
  };

  const saveMessages = async () => {
    if (!loadedTopic) return;
    if (messagesParse.error) {
      setError(messagesParse.error);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/curriculum-drafts/topic/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...loadedTopic, module: loadedTopic.moduleDir, topic: loadedTopic.topicDir, messagesJson: messagesParse.value }),
      });
      await readJsonResponse(response);
      await reloadCurrentTopic();
      setStatus("Saved messages JSON directly to the draft.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save messages");
    } finally {
      setLoading(false);
    }
  };

  const saveMessageKey = async (keyPath: string, value: string) => {
    if (!loadedTopic) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/curriculum-drafts/topic/message-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...loadedTopic, module: loadedTopic.moduleDir, topic: loadedTopic.topicDir, keyPath, value }),
      });
      await readJsonResponse(response);
      await reloadCurrentTopic();
      setStatus(`Saved ${keyPath}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save message key");
    } finally {
      setLoading(false);
    }
  };


  const applySketchJson = (sketchIdToUpdate: string, sketchJson: unknown) => {
    try {
      if (sketchId(sketchJson) !== sketchIdToUpdate) {
        throw new Error(`Sketch id must stay as ${sketchIdToUpdate}.`);
      }
      const parsed = parseJsonOrError(bundleText);
      if (parsed.error) throw new Error(parsed.error);
      const nextBundle = replaceSketchInBundle(parsed.value, sketchIdToUpdate, sketchJson);
      setBundleText(jsonPretty(nextBundle));
      setStatus(`Applied ${sketchIdToUpdate} to Bundle JSON. Save Bundle to persist.`);
      setTab("bundle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply sketch JSON");
    }
  };

  const applyExerciseJson = (exerciseIdToUpdate: string, exerciseJson: unknown) => {
    try {
      if (exerciseId(exerciseJson) !== exerciseIdToUpdate) {
        throw new Error(`Exercise id must stay as ${exerciseIdToUpdate}.`);
      }
      const parsed = parseJsonOrError(bundleText);
      if (parsed.error) throw new Error(parsed.error);
      const nextBundle = replaceExerciseInBundle(parsed.value, exerciseIdToUpdate, exerciseJson);
      setBundleText(jsonPretty(nextBundle));
      setStatus(`Applied ${exerciseIdToUpdate} to Bundle JSON. Save Bundle to persist.`);
      setTab("bundle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply exercise JSON");
    }
  };

  const applyBundleFileContent = (exerciseIdToUpdate: string, path: string, side: FileSide, value: string) => {
    try {
      const parsed = parseJsonOrError(bundleText);
      if (parsed.error) throw new Error(parsed.error);
      const nextBundle = updateExerciseFileContentInBundle(parsed.value, exerciseIdToUpdate, path, side, value);
      setBundleText(jsonPretty(nextBundle));
      setStatus(`Applied ${side} file ${path} to Bundle JSON. Save Bundle to persist.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply inline file content");
    }
  };

  const previewLoadedTopic = (source: "draft" | "generated") => {
    if (!loadedTopic) {
      setError("Load a topic before previewing.");
      return;
    }

    if (dirtyBundle || dirtyMessages) {
      const proceed = window.confirm(
        source === "draft"
          ? "You have unsaved changes. Draft preview reads the last saved .curriculum-drafts files. Save first for the most accurate preview. Continue anyway?"
          : "You have unsaved changes. Generated preview reads topics.generated.ts. Save and run Gen manifests first for the most accurate preview. Continue anyway?",
      );
      if (!proceed) return;
    }

    try {
      const target = previewTargetFromBundle(bundleParse.value, selectedExerciseId);
      const moduleSlug = typeof asObject(bundleParse.value)?.moduleSlug === "string"
        ? String(asObject(bundleParse.value)?.moduleSlug)
        : selectedModuleData?.moduleSlug ?? selectedModule;
      const locale = loadedTopic.locale || "en";
      const generatedSubject = subjectForGeneratedPreview(selectedCatalog, selectedSubject);
      const subjectSlug = source === "generated" ? generatedSubject : selectedSubject;
      const previewSectionSlug = source === "generated"
        ? sectionForGeneratedPreview(selectedCatalog, selectedSubject, target.sectionSlug)
        : target.sectionSlug;
      const query = new URLSearchParams({
        draftPreview: "1",
        source,
        e2eUnlockAll: "1",
        ts: String(Date.now()),
      });

      if (source === "draft") {
        query.set("catalog", selectedCatalog);
        query.set("subject", selectedSubject);
        query.set("moduleDir", loadedTopic.moduleDir || selectedModule);
        query.set("topicDir", loadedTopic.topicDir || selectedTopic);
      }

      const previewUrl =
        `/${encodeURIComponent(locale)}/dev/e2e/review-module-clone/${encodeURIComponent(subjectSlug)}` +
        `/${encodeURIComponent(moduleSlug)}/learn/${encodeURIComponent(previewSectionSlug)}` +
        `/${encodeURIComponent(target.topicSlug)}/${encodeURIComponent(target.targetKind)}` +
        `/${encodeURIComponent(target.targetSlug)}?${query.toString()}`;

      window.open(previewUrl, "_blank", "noopener,noreferrer");
      setStatus(
        source === "draft"
          ? "Opened draft preview directly from saved .curriculum-drafts files."
          : "Opened generated dev review preview. Run Gen manifests first if you changed draft files.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to build preview URL");
    }
  };

  const backupDraft = async () => {
    if (!selectedCatalog || !selectedSubject) {
      setError("Choose a subject draft before creating a backup.");
      return;
    }

    setBackupRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/curriculum-drafts/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog: selectedCatalog,
          subject: selectedSubject,
          locale: loadedTopic?.locale || "en",
        }),
      });
      const body = await readJsonResponse<BackupResult>(response);
      setStatus(`Backup created: ${body.backup?.backupRoot ?? ".curriculum-backups"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to back up draft");
    } finally {
      setBackupRunning(false);
    }
  };

  const runCommand = async (command: string) => {
    if (!loadedTopic && command.startsWith("course:")) {
      setError("Load a topic first so the editor knows which catalog/subject to check.");
      return;
    }
    setCommandRunning(true);
    setCommandResult(null);
    setError(null);
    try {
      const response = await fetch("/api/dev/curriculum-drafts/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, catalog: selectedCatalog, subject: selectedSubject }),
      });
      const body = await readJsonResponse<CommandResult>(response);
      setCommandResult(body);
      setStatus(`${body.command ?? command} finished with exit ${body.exitCode ?? "?"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run command");
    } finally {
      setCommandRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-950">
        <span className="font-semibold">Local dev draft editor</span> — saves update <span className="font-mono">.curriculum-drafts</span> directly. Use <span className="font-semibold">Backup draft</span> when you want a manual snapshot.
      </div>

      <div className="grid min-h-[calc(100vh-45px)] grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="border-r border-slate-200 bg-white p-4">
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Catalog</label>
            <select value={selectedCatalog} onChange={(event) => selectCatalog(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {catalogs.length === 0 ? <option value="">No draft catalogs found</option> : null}
              {catalogs.map((catalog) => <option key={catalog.catalog} value={catalog.catalog}>{catalog.catalog}</option>)}
            </select>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Subject draft</label>
            <select value={selectedSubject} onChange={(event) => selectSubject(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {(selectedCatalogData?.subjects ?? []).length === 0 ? <option value="">No subject drafts found</option> : null}
              {(selectedCatalogData?.subjects ?? []).map((subject: DraftSubjectSummary) => <option key={subject.subject} value={subject.subject}>{subject.subject}</option>)}
            </select>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Module</label>
            <select value={selectedModule} onChange={(event) => selectModule(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {(selectedSubjectData?.modules ?? []).length === 0 ? <option value="">No modules found</option> : null}
              {(selectedSubjectData?.modules ?? []).map((module: DraftModuleSummary) => <option key={module.moduleDir} value={module.moduleDir}>{module.moduleDir} · {module.moduleSlug}</option>)}
            </select>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Search topics</label>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="topic slug or title" />
          </div>

          <div className="mt-5 space-y-2">
            {filteredTopics.map((topic) => (
              <button
                key={topic.topicDir}
                type="button"
                onClick={() => void loadTopic(topic)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm hover:bg-slate-50 ${selectedTopic === topic.topicDir ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
              >
                <div className="truncate font-semibold">{topic.topicDir}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{topic.title ?? topic.topicId ?? topic.topicSlug}</div>
              </button>
            ))}
          </div>

          {catalogs.length === 0 && listDebug ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <div className="font-bold">No draft catalogs loaded</div>
              <div className="mt-2 space-y-1 font-mono">
                <div>cwd: {listDebug.cwd}</div>
                <div>draftRoot: {listDebug.draftRoot}</div>
                <div>repoRoot: {listDebug.repoRoot}</div>
              </div>
              {listDebug.warnings.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {listDebug.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">Checked paths</summary>
                <div className="mt-2 max-h-48 overflow-auto space-y-1 font-mono">
                  {listDebug.candidates.map((candidate) => (
                    <div key={`${candidate.source}:${candidate.path}`} className={candidate.exists ? "text-emerald-700" : "text-slate-500"}>
                      {candidate.exists ? "✓" : "×"} {candidate.path} ({candidate.source})
                    </div>
                  ))}
                </div>
              </details>
              <div className="mt-3 rounded-xl bg-white/70 p-2">
                Add this to <span className="font-mono">apps/web/.env.local</span> if needed:<br />
                <span className="font-mono">DEV_CURRICULUM_DRAFT_ROOT=/Users/admin/Documents/NextJSProject/zoeskoul.com/.curriculum-drafts</span>
              </div>
            </div>
          ) : null}
        </aside>

        <main className="min-w-0 p-5">
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold">Curriculum Draft Editor</h1>
                <p className="mt-1 max-w-4xl truncate font-mono text-xs text-slate-500">
                  {loadedTopic ? `${loadedTopic.paths.bundle} · ${loadedTopic.paths.messages}` : "Choose a topic from the left sidebar."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void reloadCurrentTopic()} disabled={loading || !selectedTopic} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">
                  {loading ? "Loading…" : "Load"}
                </button>
                <button
                  type="button"
                  onClick={() => void backupDraft()}
                  disabled={backupRunning || !selectedCatalog || !selectedSubject}
                  title="Back up the currently saved subject draft and its messages"
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-40"
                >
                  {backupRunning ? "Backing up…" : "Backup draft"}
                </button>
                <button type="button" onClick={() => previewLoadedTopic("draft")} disabled={!loadedTopic} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Preview Draft</button>
                <button type="button" onClick={() => previewLoadedTopic("generated")} disabled={!loadedTopic} className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">Preview Generated</button>
                <button type="button" onClick={() => void runCommand("gen:manifests")} disabled={commandRunning} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Gen manifests</button>
                <button type="button" onClick={() => void runCommand("course:check")} disabled={commandRunning} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Course check</button>
                <button type="button" onClick={() => void runCommand("course:check:resume")} disabled={commandRunning} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Resume check</button>
                <button type="button" onClick={() => void runCommand("typecheck")} disabled={commandRunning} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">Typecheck</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {dirtyBundle ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">bundle dirty</span> : null}
              {dirtyMessages ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">messages dirty</span> : null}
              {status ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{status}</span> : null}
              {error ? <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">{error}</span> : null}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${tab === item.key ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {!loadedTopic ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">Load a topic to begin editing.</div>
          ) : null}

          {loadedTopic && tab === "overview" ? (
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exercises</div>
                <div className="mt-2 text-3xl font-bold">{loadedTopic.exercises.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnostics</div>
                <div className="mt-2 text-3xl font-bold">{loadedTopic.diagnostics.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project steps</div>
                <div className="mt-2 text-3xl font-bold">{loadedTopic.projectFlow.length}</div>
              </div>
            </section>
          ) : null}

          {loadedTopic && tab === "bundle" ? <JsonEditor title="topic.bundle.json" value={bundleText} onChange={setBundleText} onSave={saveBundle} disabled={loading || Boolean(bundleParse.error)} error={bundleParse.error} /> : null}
          {loadedTopic && tab === "messages" ? <JsonEditor title="messages JSON" value={messagesText} onChange={setMessagesText} onSave={saveMessages} disabled={loading || Boolean(messagesParse.error)} error={messagesParse.error} /> : null}

          {loadedTopic && tab === "sketches" ? (
            <SketchesEditor
              bundleJson={bundleParse.value}
              messagesJson={messagesParse.value}
              selectedSketchId={selectedSketchId}
              onSelectSketch={setSelectedSketchId}
              onApplySketchJson={applySketchJson}
              onSaveMessageKey={saveMessageKey}
            />
          ) : null}
          {loadedTopic && tab === "exercises" ? (
            <div className="space-y-4">
              <ExerciseTable exercises={loadedTopic.exercises} selectedExerciseId={selectedExerciseId} onSelect={setSelectedExerciseId} />
              <ExerciseMessageEditor
                exercises={loadedTopic.exercises}
                selectedExerciseId={selectedExerciseId}
                bundleJson={bundleParse.value}
                messagesJson={messagesParse.value}
                onSelect={setSelectedExerciseId}
                onSaveMessageKey={saveMessageKey}
              />
              <ExerciseJsonEditor
                exercises={loadedTopic.exercises}
                selectedExerciseId={selectedExerciseId}
                bundleJson={bundleParse.value}
                onSelect={setSelectedExerciseId}
                onApplyExerciseJson={applyExerciseJson}
              />
            </div>
          ) : null}
          {loadedTopic && tab === "files" ? (
            <FilePairEditor
              topicKey={`${loadedTopic.catalog}:${loadedTopic.subject}:${loadedTopic.moduleDir}:${loadedTopic.topicDir}`}
              filePairs={loadedTopic.filePairs}
              selectedExerciseId={selectedExerciseId}
              onSaveMessageKey={saveMessageKey}
              onApplyBundleFileContent={applyBundleFileContent}
            />
          ) : null}
          {loadedTopic && tab === "project" ? <ProjectFlowPanel steps={loadedTopic.projectFlow} /> : null}
          {loadedTopic && tab === "validation" ? <DiagnosticsPanel diagnostics={loadedTopic.diagnostics} /> : null}

          {commandResult ? (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Command output</div>
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                {commandResult.command ? `$ ${commandResult.command}\n\n` : ""}{commandResult.output ?? commandResult.error ?? ""}
              </pre>
            </section>
          ) : null}
        </main>

        <aside className="border-l border-slate-200 bg-slate-50 p-4">
          <DiagnosticsPanel diagnostics={loadedTopic?.diagnostics ?? []} />
        </aside>
      </div>
    </div>
  );
}
