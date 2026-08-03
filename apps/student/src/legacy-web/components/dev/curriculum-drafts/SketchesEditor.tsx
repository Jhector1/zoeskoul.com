"use client";

import { useEffect, useMemo, useState } from "react";
import { keepEditorSelection } from "./editorSelection";

type JsonObject = Record<string, unknown>;

type SketchRow = {
  id: string;
  archetype: string | null;
  titleKey: string | null;
  bodyKey: string | null;
  cardId: string | null;
  cardTitleKey: string | null;
  raw: unknown;
};

type SketchesEditorProps = {
  bundleJson: unknown;
  messagesJson: unknown | null;
  selectedSketchId: string | null;
  onSelectSketch: (sketchId: string | null) => void;
  onApplySketchJson: (sketchId: string, sketchJson: unknown) => void;
  onSaveMessageKey: (keyPath: string, value: string) => void | Promise<void>;
};

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeMessageKey(value: unknown) {
  const text = asString(value);
  if (!text) return null;
  return text.startsWith("@:") ? text.slice(2) : text;
}

function getByPath(root: unknown, keyPath: string | null) {
  if (!keyPath) return undefined;
  const parts = keyPath.split(".").filter(Boolean);
  let current: unknown = root;

  for (const part of parts) {
    const object = asObject(current);
    if (!object) return undefined;
    current = object[part];
  }

  return current;
}

function jsonPretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJson(text: string) {
  try {
    return { value: JSON.parse(text) as unknown, error: null as string | null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

function sketchId(value: unknown) {
  const object = asObject(value);
  return asString(object?.id);
}

function getSketchRows(bundleJson: unknown): SketchRow[] {
  const bundle = asObject(bundleJson);
  const sketches = asArray(bundle?.sketches);
  const cards = asArray(bundle?.cards).flatMap((card) => {
    const object = asObject(card);
    return object ? [object] : [];
  });
  const rows: SketchRow[] = [];

  for (const sketch of sketches) {
    const object = asObject(sketch);
    const id = asString(object?.id);
    if (!object || !id) continue;

    const card = cards.find((candidate) => asString(candidate.sketchId) === id) ?? null;
    rows.push({
      id,
      archetype: asString(object.archetype),
      titleKey: normalizeMessageKey(object.titleKey),
      bodyKey: normalizeMessageKey(object.bodyKey),
      cardId: asString(card?.id),
      cardTitleKey: normalizeMessageKey(card?.titleKey),
      raw: sketch,
    });
  }

  return rows;
}

function messageValue(messagesJson: unknown | null, keyPath: string | null) {
  const value = getByPath(messagesJson, keyPath);
  return typeof value === "string" ? value : "";
}

export default function SketchesEditor({
  bundleJson,
  messagesJson,
  selectedSketchId,
  onSelectSketch,
  onApplySketchJson,
  onSaveMessageKey,
}: SketchesEditorProps) {
  const sketches = useMemo(() => getSketchRows(bundleJson), [bundleJson]);
  const resolvedSketchId = keepEditorSelection(selectedSketchId, sketches.map((sketch) => sketch.id));
  const selectedSketch = useMemo(
    () => sketches.find((sketch) => sketch.id === resolvedSketchId) ?? null,
    [resolvedSketchId, sketches],
  );

  const [sketchJsonText, setSketchJsonText] = useState("{}");
  const [titleText, setTitleText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [cardTitleText, setCardTitleText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (resolvedSketchId !== selectedSketchId) onSelectSketch(resolvedSketchId);
  }, [onSelectSketch, resolvedSketchId, selectedSketchId]);

  useEffect(() => {
    if (!selectedSketch) {
      setSketchJsonText("{}");
      setTitleText("");
      setBodyText("");
      setCardTitleText("");
      return;
    }

    setSketchJsonText(jsonPretty(selectedSketch.raw));
    setTitleText(messageValue(messagesJson, selectedSketch.titleKey));
    setBodyText(messageValue(messagesJson, selectedSketch.bodyKey));
    setCardTitleText(messageValue(messagesJson, selectedSketch.cardTitleKey));
    setLocalError(null);
  }, [messagesJson, selectedSketch]);

  const parsedSketch = useMemo(() => parseJson(sketchJsonText), [sketchJsonText]);

  const saveKey = async (label: string, keyPath: string | null, value: string) => {
    if (!keyPath) {
      setLocalError(`${label} has no message key in the bundle.`);
      return;
    }
    setLocalError(null);
    await onSaveMessageKey(keyPath, value);
  };

  const applySketch = () => {
    if (!selectedSketch) return;
    if (parsedSketch.error) {
      setLocalError(parsedSketch.error);
      return;
    }
    if (sketchId(parsedSketch.value) !== selectedSketch.id) {
      setLocalError(`Sketch id must stay as ${selectedSketch.id}.`);
      return;
    }
    setLocalError(null);
    onApplySketchJson(selectedSketch.id, parsedSketch.value);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="font-semibold">Sketches</div>
          <p className="mt-1 text-sm text-slate-500">
            Edit sketch structure in the bundle, and edit sketch/card text through message keys for translation.
          </p>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Archetype</th>
                <th className="px-4 py-2">Title key</th>
                <th className="px-4 py-2">Body key</th>
                <th className="px-4 py-2">Card</th>
              </tr>
            </thead>
            <tbody>
              {sketches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No sketches found in this topic bundle.</td>
                </tr>
              ) : null}
              {sketches.map((sketch) => (
                <tr
                  key={sketch.id}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selectedSketch?.id === sketch.id ? "bg-emerald-50" : ""}`}
                  onClick={() => onSelectSketch(sketch.id)}
                >
                  <td className="px-4 py-2 font-mono text-xs font-semibold">{sketch.id}</td>
                  <td className="px-4 py-2">{sketch.archetype ?? "—"}</td>
                  <td className="max-w-[260px] truncate px-4 py-2 font-mono text-xs text-slate-500">{sketch.titleKey ?? "—"}</td>
                  <td className="max-w-[320px] truncate px-4 py-2 font-mono text-xs text-slate-500">{sketch.bodyKey ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{sketch.cardId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSketch ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="font-semibold">Sketch content messages</div>
                <p className="mt-1 text-xs text-slate-500">These saves update the current messages JSON directly.</p>
              </div>
              {localError ? <span className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-700">{localError}</span> : null}
            </div>

            <div className="space-y-4 p-4">
              {selectedSketch.cardTitleKey ? (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card title</label>
                    <button
                      type="button"
                      onClick={() => void saveKey("Card title", selectedSketch.cardTitleKey, cardTitleText)}
                      className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Save card title
                    </button>
                  </div>
                  <div className="mb-2 truncate font-mono text-xs text-slate-500">{selectedSketch.cardTitleKey}</div>
                  <input
                    value={cardTitleText}
                    onChange={(event) => setCardTitleText(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sketch title</label>
                  <button
                    type="button"
                    onClick={() => void saveKey("Sketch title", selectedSketch.titleKey, titleText)}
                    className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    disabled={!selectedSketch.titleKey}
                  >
                    Save title
                  </button>
                </div>
                <div className="mb-2 truncate font-mono text-xs text-slate-500">{selectedSketch.titleKey ?? "No titleKey"}</div>
                <input
                  value={titleText}
                  onChange={(event) => setTitleText(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sketch body markdown</label>
                  <button
                    type="button"
                    onClick={() => void saveKey("Sketch body", selectedSketch.bodyKey, bodyText)}
                    className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    disabled={!selectedSketch.bodyKey}
                  >
                    Save body
                  </button>
                </div>
                <div className="mb-2 truncate font-mono text-xs text-slate-500">{selectedSketch.bodyKey ?? "No bodyKey"}</div>
                <textarea
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                  className="min-h-[380px] w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none focus:ring-2 focus:ring-emerald-400"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="font-semibold">Sketch structure JSON</div>
                <p className="mt-1 text-xs text-slate-500">Use this only for archetype, ids, and key fields. Text should stay in messages.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSketchJsonText(jsonPretty(selectedSketch.raw))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  Revert
                </button>
                <button
                  type="button"
                  onClick={applySketch}
                  disabled={Boolean(parsedSketch.error)}
                  className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Apply to bundle
                </button>
              </div>
            </div>
            {parsedSketch.error ? <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{parsedSketch.error}</div> : null}
            <textarea
              value={sketchJsonText}
              onChange={(event) => setSketchJsonText(event.target.value)}
              className="min-h-[560px] w-full resize-y rounded-b-2xl border-0 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none focus:ring-2 focus:ring-emerald-400"
              spellCheck={false}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
