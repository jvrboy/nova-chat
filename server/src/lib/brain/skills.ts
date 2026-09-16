/**
 * Skill Store — procedural memory
 * ──────────────────────────────
 * When the Brain solves a task, it can compile the winning strategy into
 * a "skill": a reusable (trigger + approach + steps) pattern that can be
 * retrieved for similar future tasks.
 *
 * Skills have a `mastery` score (0..1) that grows with use and shrinks
 * with failures. Above mastery 0.8 a skill is considered "mastered" and
 * its pattern becomes a default strategy for its category.
 */

import { db } from './db';
import type { SkillRecord, TaskCategory } from './types';

export interface SkillPattern {
  trigger: string;
  approach: string;
  steps: string[];
}

class SkillStore {
  async create(
    name: string,
    category: TaskCategory | 'meta',
    description: string,
    pattern: SkillPattern,
  ): Promise<SkillRecord> {
    const rec = await db.skill.create({
      data: {
        name,
        category,
        description,
        pattern: JSON.stringify(pattern),
      },
    });
    return this.deserialize(rec);
  }

  async findByName(name: string): Promise<SkillRecord | null> {
    const rec = await db.skill.findUnique({ where: { name } });
    return rec ? this.deserialize(rec) : null;
  }

  async findForCategory(category: TaskCategory): Promise<SkillRecord | null> {
    // Return the highest-mastery skill for a category
    const rec = await db.skill.findFirst({
      where: { category, mastery: { gte: 0.5 } },
      orderBy: { mastery: 'desc' },
    });
    return rec ? this.deserialize(rec) : null;
  }

  async findSimilar(query: string, limit = 3): Promise<SkillRecord[]> {
    const tokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    if (tokens.length === 0) return [];
    const all = await db.skill.findMany({
      where: { mastery: { gte: 0.3 } },
      orderBy: { mastery: 'desc' },
      take: 50,
    });
    return all
      .map((s) => {
        const text = (s.name + ' ' + s.description).toLowerCase();
        const hits = tokens.filter((t) => text.includes(t)).length;
        return { rec: s, score: hits };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => this.deserialize(s.rec));
  }

  async recordUse(id: string, success: boolean): Promise<void> {
    const skill = await db.skill.findUnique({ where: { id } });
    if (!skill) return;

    const newUses = skill.uses + 1;
    const newSuccesses = skill.successes + (success ? 1 : 0);
    const newFailures = skill.failures + (success ? 0 : 1);
    const newSuccessRate = newSuccesses / newUses;

    // Mastery update via simple Bayesian-ish update:
    //   newMastery = 0.85 * oldMastery + 0.15 * (success ? 1 : 0)
    // This converges to true skill success rate over time.
    const newMastery = Math.max(
      0,
      Math.min(1, skill.mastery * 0.85 + (success ? 0.15 : 0)),
    );

    // Refine skill: if mastery is regressing, bump version to signal instability
    const version =
      newMastery < skill.mastery - 0.05 ? skill.version + 1 : skill.version;

    await db.skill.update({
      where: { id },
      data: {
        uses: newUses,
        successes: newSuccesses,
        failures: newFailures,
        successRate: newSuccessRate,
        mastery: Math.round(newMastery * 1000) / 1000,
        version,
      },
    });
  }

  async refine(id: string, refinedPattern: SkillPattern): Promise<void> {
    const skill = await db.skill.findUnique({ where: { id } });
    if (!skill) return;
    await db.skill.update({
      where: { id },
      data: {
        pattern: JSON.stringify(refinedPattern),
        version: skill.version + 1,
      },
    });
  }

  async all(limit = 50): Promise<SkillRecord[]> {
    const recs = await db.skill.findMany({
      orderBy: { mastery: 'desc' },
      take: limit,
    });
    return recs.map((r) => this.deserialize(r));
  }

  async masteredCount(): Promise<number> {
    return db.skill.count({ where: { mastery: { gte: 0.8 } } });
  }

  async count(): Promise<number> {
    return db.skill.count();
  }

  private deserialize(r: any): SkillRecord {
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description,
      pattern: typeof r.pattern === 'string' ? JSON.parse(r.pattern) : r.pattern,
      successRate: r.successRate,
      uses: r.uses,
      successes: r.successes,
      failures: r.failures,
      mastery: r.mastery,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

export const skills = new SkillStore();
