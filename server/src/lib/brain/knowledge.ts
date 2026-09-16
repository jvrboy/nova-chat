/**
 * Knowledge Base — semantic memory as a small fact graph
 * ──────────────────────────────────────────────────────
 * Subject → Predicate → Object triples with confidence scores.
 * The Brain uses this to recall facts that inform task solving.
 */

import { db } from './db';

export interface KnowledgeFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string | null;
  createdAt: Date;
}

class KnowledgeBase {
  async assert(
    subject: string,
    predicate: string,
    object: string,
    confidence = 0.7,
    source: string | null = null,
  ): Promise<KnowledgeFact> {
    // Check if same fact exists; if so, update confidence.
    const existing = await db.knowledge.findFirst({
      where: { subject, predicate, object },
    });
    if (existing) {
      const updated = await db.knowledge.update({
        where: { id: existing.id },
        data: {
          confidence: Math.min(1, existing.confidence + 0.1),
        },
      });
      return this.deserialize(updated);
    }
    const created = await db.knowledge.create({
      data: { subject, predicate, object, confidence, source },
    });
    return this.deserialize(created);
  }

  async queryAbout(subject: string): Promise<KnowledgeFact[]> {
    const recs = await db.knowledge.findMany({
      where: { subject },
      orderBy: { confidence: 'desc' },
    });
    return recs.map((r) => this.deserialize(r));
  }

  async search(query: string, limit = 5): Promise<KnowledgeFact[]> {
    const tokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    if (tokens.length === 0) return [];
    const all = await db.knowledge.findMany({
      orderBy: { confidence: 'desc' },
      take: 500,
    });
    return all
      .map((r) => {
        const text = `${r.subject} ${r.predicate} ${r.object}`.toLowerCase();
        const hits = tokens.filter((t) => text.includes(t)).length;
        return { rec: r, score: hits };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => this.deserialize(s.rec));
  }

  async count(): Promise<number> {
    return db.knowledge.count();
  }

  private deserialize(r: any): KnowledgeFact {
    return {
      id: r.id,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      confidence: r.confidence,
      source: r.source,
      createdAt: r.createdAt,
    };
  }
}

export const knowledge = new KnowledgeBase();
