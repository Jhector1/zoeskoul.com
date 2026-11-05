import { randomUUID } from "node:crypto";

type Drain = Readonly<{ id: string; at: number }>;

/** One runner process owns its preview map; drain locks it against new starts. */
export class PreviewProjectDrainRegistry {
  private readonly pending = new Map<string, number>();
  private readonly draining = new Map<string, Drain>();
  static readonly ttlMs = 60 * 60_000;

  private key(ownerKey: string, projectId: string): string {
    if (!ownerKey.trim() || !projectId.trim()) throw new Error("Forbidden.");
    return JSON.stringify([ownerKey, projectId]);
  }

  private sweep(now = Date.now()): void {
    for (const [key, drain] of this.draining) {
      if (now - drain.at >= PreviewProjectDrainRegistry.ttlMs) this.draining.delete(key);
    }
  }

  assertNotDraining(ownerKey: string, projectId: string): void {
    this.sweep();
    if (this.draining.has(this.key(ownerKey, projectId))) {
      throw new Error("Project deletion in progress.");
    }
  }

  beginStart(ownerKey: string, projectId: string): () => void {
    this.assertNotDraining(ownerKey, projectId);
    const key = this.key(ownerKey, projectId);
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      const count = this.pending.get(key) ?? 0;
      if (count <= 1) this.pending.delete(key);
      else this.pending.set(key, count - 1);
    };
  }

  beginDrain(ownerKey: string, projectId: string): string {
    this.sweep();
    const key = this.key(ownerKey, projectId);
    if (this.draining.has(key)) throw new Error("Project deletion already in progress.");
    if ((this.pending.get(key) ?? 0) > 0) {
      throw new Error("Preview startup in progress; retry project deletion.");
    }
    const id = `drain_${randomUUID()}`;
    this.draining.set(key, { id, at: Date.now() });
    return id;
  }

  releaseDrain(ownerKey: string, projectId: string, id: string): boolean {
    const key = this.key(ownerKey, projectId);
    const drain = this.draining.get(key);
    if (!drain || drain.id !== id) return false;
    this.draining.delete(key);
    return true;
  }

  reset(): void {
    this.pending.clear();
    this.draining.clear();
  }
}
