/**
 * Memory System
 * ─────────────
 * Four memory stores:
 *   • working    — short-term, current task context (in-memory only, capped)
 *   • episodic   — events / experiences
 *   • semantic   — facts / knowledge
 *   • procedural — compiled skills (see SkillStore)
 *
 * Each memory has an importance score 0..1 that decays over time but
 * is reinforced on every retrieval ("spaced repetition"-lite). This is
 * the Brain's hippocampus + neocortex analog.
 */

import { db } from './db';
import type { MemoryKind, MemoryRecord } from './types';

const WORKING_CAP = 32; // items in working memory at once

export interface StoreOptions {
  importance?: number;
  source?: string;
  tags?: string[];
  relatedIds?: string[];
}

class MemorySystem {
  private working: { content: string; importance: number; ts: number }[] = [];
  private warm = false; // becomes true after first DB read

  // ── Working memory (volatile) ────────────────────────────────────────
  pushWorking(content: string, importance = 0.5): void {
    this.working.push({ content, importance, ts: Date.now() });
    if (this.working.length > WORKING_CAP) {
      // drop the least-important oldest item
      this.working.sort((a, b) => b.importance - a.importance);
      this.working.pop();
    }
  }

  getWorking(limit = 8): string[] {
    return [...this.working]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit)
      .map((m) => m.content);
  }

  clearWorking(): void {
    this.working = [];
  }

  // ── Long-term memory (persisted) ──────────────────────────────────────
  async store(
    kind: MemoryKind,
    content: string,
    opts: StoreOptions = {},
  ): Promise<MemoryRecord> {
    const importance = opts.importance ?? 0.5;
    const created = await db.memory.create({
      data: {
        kind,
        content,
        importance,
        source: opts.source ?? null,
        tags: opts.tags?.join(',') ?? null,
        relatedIds: opts.relatedIds?.join(',') ?? null,
      },
    });
    return this.deserialize(created);
  }

  async recall(
    query: string,
    kind?: MemoryKind,
    limit = 5,
  ): Promise<MemoryRecord[]> {
    const tokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    if (tokens.length === 0) return [];

    // Naive but effective: token-overlap scoring, weighted by importance
    const candidates = await db.memory.findMany({
      where: kind ? { kind } : undefined,
      take: 500,
      orderBy: { importance: 'desc' },
    });

    const scored = candidates
      .map((m) => {
        const content = m.content.toLowerCase();
        const hits = tokens.filter((t) => content.includes(t)).length;
        const score = (hits / tokens.length) * 0.7 + m.importance * 0.3;
        return { rec: m, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Reinforce retrieved memories (spaced repetition)
    if (scored.length > 0) {
      await Promise.all(
        scored.map((s) =>
          db.memory.update({
            where: { id: s.rec.id },
            data: {
              accessCount: { increment: 1 },
              lastAccess: new Date(),
              importance: Math.min(1, s.rec.importance + 0.05),
            },
          }),
        ),
      );
    }
    this.warm = true;
    return scored.map((s) => this.deserialize(s.rec));
  }

  async recallById(id: string): Promise<MemoryRecord | null> {
    const m = await db.memory.findUnique({ where: { id } });
    return m ? this.deserialize(m) : null;
  }

  async decay(): Promise<number> {
    // Decay all long-term memories slightly each call. Important & recently
    // accessed memories decay slower (Ebbinghaus curve approximation).
    const now = Date.now();
    const all = await db.memory.findMany();
    let updated = 0;
    for (const m of all) {
      const ageDays = (now - m.lastAccess.getTime()) / 86_400_000;
      const decayFactor = Math.exp(-ageDays / 30); // ~30 day halving
      const newImportance = m.importance * (0.95 + 0.05 * decayFactor);
      if (Math.abs(newImportance - m.importance) > 0.001) {
        await db.memory.update({
          where: { id: m.id },
          data: { importance: Math.round(newImportance * 1000) / 1000 },
        });
        updated++;
      }
    }
    return updated;
  }

  async count(): Promise<number> {
    return db.memory.count();
  }

  async recent(limit = 10, kind?: MemoryKind): Promise<MemoryRecord[]> {
    const recs = await db.memory.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return recs.map((r) => this.deserialize(r));
  }

  async forgetLeastImportant(keep = 1000): Promise<number> {
    const total = await db.memory.count();
    if (total <= keep) return 0;
    const toDelete = total - keep;
    const weakest = await db.memory.findMany({
      orderBy: { importance: 'asc' },
      take: toDelete,
      select: { id: true },
    });
    const ids = weakest.map((w) => w.id);
    // delete one-by-one to avoid SQLite chunk limits
    let n = 0;
    for (const id of ids) {
      await db.memory.delete({ where: { id } });
      n++;
    }
    return n;
  }

  // ── helpers ───────────────────────────────────────────────────────────
  private deserialize(r: any): MemoryRecord {
    return {
      id: r.id,
      kind: r.kind as MemoryKind,
      content: r.content,
      importance: r.importance,
      accessCount: r.accessCount,
      lastAccess: r.lastAccess,
      source: r.source,
      tags: r.tags,
      relatedIds: r.relatedIds,
      createdAt: r.createdAt,
    };
  }
}

export const memory = new MemorySystem();
