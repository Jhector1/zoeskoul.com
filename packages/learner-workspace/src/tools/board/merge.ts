import { parseBoardDocument, serializeBoardDocument } from "./document";
import type { BoardElement } from "./types";

function sameElement(a: BoardElement | undefined, b: BoardElement | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function canonicalizeBoardBody(body: string) {
  if (!body.trim()) return serializeBoardDocument(parseBoardDocument(body));

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.elements)
    ) {
      return null;
    }
    return serializeBoardDocument(parseBoardDocument(body));
  } catch {
    return null;
  }
}

/**
 * Three-way merge for concurrent board saves. Changes to different element ids
 * are preserved. When the same element changed on both clients, the incoming
 * edit wins while unrelated remote edits remain intact.
 */
export function mergeBoardBodies(args: {
  baseBody: string;
  incomingBody: string;
  currentBody: string;
}) {
  const base = parseBoardDocument(args.baseBody);
  const incoming = parseBoardDocument(args.incomingBody);
  const current = parseBoardDocument(args.currentBody);

  const baseById = new Map(base.elements.map((element) => [element.id, element]));
  const incomingById = new Map(incoming.elements.map((element) => [element.id, element]));
  const currentById = new Map(current.elements.map((element) => [element.id, element]));
  const ids = new Set([...baseById.keys(), ...incomingById.keys(), ...currentById.keys()]);

  for (const id of ids) {
    const before = baseById.get(id);
    const local = incomingById.get(id);
    const remote = currentById.get(id);
    const localChanged = !sameElement(before, local);
    const remoteChanged = !sameElement(before, remote);

    if (!localChanged) continue;
    if (local === undefined) {
      currentById.delete(id);
      continue;
    }
    if (!remoteChanged || !sameElement(local, remote)) {
      currentById.set(id, local);
    }
  }

  const incomingOrder = incoming.elements.map((element) => element.id);
  const remoteOrder = current.elements.map((element) => element.id);
  const order = [...remoteOrder, ...incomingOrder.filter((id) => !remoteOrder.includes(id))];
  const elements = order
    .map((id) => currentById.get(id))
    .filter((element): element is BoardElement => Boolean(element));

  return serializeBoardDocument({ version: 1, elements });
}
