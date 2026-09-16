/**
 * Brain Core — the orchestrator
 * ──────────────────────────────
 * The Brain combines Memory + Skills + Knowledge + Reasoning + Reflection
 * into one cognitive loop:
 *
 *     observe → reason → plan → act → verify → reflect → learn
 *
 * It maintains an internal "cycle counter" (its heartbeat), tracks
 * capabilities across all categories, and runs a self-reflection after
 * every task that scored below 0.7.
 */

import { db } from './db';
import { memory } from './memory';
import { skills } from './skills';
import { knowledge } from './knowledge';
import { reason } from './reasoning';
import type {
  BrainSnapshot,
  CapabilityMap,
  SolveResult,
  TaskCategory,
  TaskRecord,
  Cognition,
  Reflection,
} from './types';

const BOOT_TIME = Date.now();
let cycle = 0;
let currentTaskId: string | null = null;
let status: BrainSnapshot['status'] = 'idle';

// Default capability map for a fresh Brain. Improves over time.
const defaultCapabilities: CapabilityMap = {
  logic: 0.2,
  math: 0.2,
  language: 0.2,
  planning: 0.2,
  creative: 0.2,
  coding: 0.2,
  reasoning: 0.2,
  self_awareness: 0.1,
  learning_rate: 0.3,
  adaptability: 0.3,
};

// In-memory cache of capabilities (loaded from DB on first use)
let capabilities: CapabilityMap = { ...defaultCapabilities };

// ── Cognitive cycle (a single "tick") ──────────────────────────────────

async function tick(
  type: Cognition['type'],
  input: unknown,
  output: unknown,
  reasoning: string,
  confidence: number,
  taskId?: string,
): Promise<Cognition> {
  cycle++;
  const cog = await db.cognition.create({
    data: {
      cycle,
      type,
      input: JSON.stringify(input ?? null).slice(0, 5000),
      output: JSON.stringify(output ?? null).slice(0, 5000),
      reasoning: reasoning.slice(0, 8000),
      confidence,
      taskId: taskId ?? null,
    },
  });
  return {
    id: cog.id,
    cycle: cog.cycle,
    type: cog.type as Cognition['type'],
    input,
    output,
    reasoning,
    confidence,
    taskId: taskId ?? undefined,
    createdAt: cog.createdAt,
  };
}

// ── Solve one task ──────────────────────────────────────────────────────

export async function solveTask(taskId: string): Promise<SolveResult> {
  const startMs = Date.now();
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  currentTaskId = taskId;
  status = 'thinking';
  let cyclesUsed = 0;
  const attemptLimit = task.maxAttempts;
  let attempt = task.attempt;
  let bestResult: SolveResult | null = null;
  const allMistakes: string[] = [];

  // Mark task in-progress
  await db.task.update({
    where: { id: taskId },
    data: { status: 'in_progress', startedAt: new Date() },
  });

  // Push task to working memory
  memory.pushWorking(`Working on task #${task.id}: ${task.title}`, 0.9);
  memory.pushWorking(`Category: ${task.category}, difficulty: ${task.difficulty}`, 0.7);

  // ── Attempt loop ──
  while (attempt < attemptLimit) {
    attempt++;
    cyclesUsed++;
    status = 'working';

    // 1. OBSERVE — recall relevant memories & skills
    status = 'thinking';
    const recallQuery = `${task.title} ${task.description} ${task.category}`;
    const [recalledMems, similarSkills] = await Promise.all([
      memory.recall(recallQuery, undefined, 5),
      skills.findSimilar(recallQuery, 3),
    ]);

    await tick(
      'observe',
      { taskId, attempt, recalled: recalledMems.length, skills: similarSkills.length },
      { memories: recalledMems.map((m) => m.content.slice(0, 100)), skills: similarSkills.map((s) => s.name) },
      `Recalled ${recalledMems.length} memories and ${similarSkills.length} skills relevant to "${task.title}".`,
      0.8,
      taskId,
    );

    // 2. PLAN — pick strategy
    const chosenSkill = similarSkills[0];
    const strategy = chosenSkill ? chosenSkill.name : `default-${task.category}`;
    const hints = chosenSkill?.pattern?.steps ?? [];

    await tick(
      'plan',
      { strategy, skillMastery: chosenSkill?.mastery ?? 0 },
      { strategy, hints },
      `Selected strategy "${strategy}"${chosenSkill ? ` (mastery=${chosenSkill.mastery.toFixed(2)})` : ' (no skill match, using default)'} for ${task.category} task.`,
      chosenSkill?.mastery ?? 0.4,
      taskId,
    );

    // 3. REASON — apply the strategy
    let parsedInput: any;
    try {
      parsedInput = JSON.parse(task.input);
    } catch {
      parsedInput = task.input;
    }
    const result = reason(task.category as TaskCategory, parsedInput, hints);

    await tick(
      'reason',
      parsedInput,
      { answer: result.answer, steps: result.steps.length, verification: result.verification },
      result.steps.map((s, i) => `Step ${i + 1}: ${s.description} — ${s.detail}`).join(' || '),
      result.confidence,
      taskId,
    );

    // 4. VERIFY — compare to expected output (if provided)
    let expected: any = null;
    if (task.expected) {
      try {
        expected = JSON.parse(task.expected);
      } catch {
        expected = task.expected;
      }
    }

    let score = 0;
    let mistakes: string[] = [];
    if (expected !== null && expected !== undefined) {
      const verification = verifyAnswer(result.answer, expected);
      score = verification.score;
      mistakes = verification.mistakes;
    } else {
      // No ground truth — use confidence as score
      score = result.confidence;
    }

    allMistakes.push(...mistakes);

    // 5. ACT — record attempt
    status = 'working';
    await tick(
      'act',
      { attempt, answer: result.answer },
      { score, mistakes },
      `Attempt ${attempt}: score=${score.toFixed(2)}, mistakes=[${mistakes.join('; ')}]`,
      score,
      taskId,
    );

    // 6. If success, stop & persist
    if (score >= 0.7) {
      bestResult = {
        taskId,
        success: true,
        score,
        output: result.answer,
        reasoning: result.steps.map((s) => `${s.description}: ${s.detail}`).join('\n'),
        strategy,
        mistakes,
        lessons: [],
        cyclesUsed,
        durationMs: Date.now() - startMs,
      };
      break;
    }

    // 7. If failure & attempts remain — reflect, learn, and try again
    if (attempt < attemptLimit) {
      status = 'reflecting';
      const reflection = await reflectOnMistakes(
        taskId,
        task.category as TaskCategory,
        result.answer,
        expected,
        mistakes,
      );

      // Try alternative strategy on retry
      await tick(
        'reflect',
        { attempt, mistakes },
        { findings: reflection.findings, improvements: reflection.improvements },
        `Reflection: ${reflection.findings.join('; ')}. Improvements: ${reflection.improvements.join('; ')}`,
        0.6,
        taskId,
      );

      status = 'learning';
      memory.pushWorking(`Mistake on "${task.title}": ${mistakes.join('; ')}`, 0.8);
      memory.pushWorking(`Lesson: ${reflection.improvements[0] ?? 'try alternative strategy'}`, 0.85);
    }

    bestResult = {
      taskId,
      success: false,
      score,
      output: result.answer,
      reasoning: result.steps.map((s) => `${s.description}: ${s.detail}`).join('\n'),
      strategy,
      mistakes,
      lessons: [],
      cyclesUsed,
      durationMs: Date.now() - startMs,
    };
  }

  if (!bestResult) {
    bestResult = {
      taskId,
      success: false,
      score: 0,
      output: null,
      reasoning: 'No attempts completed.',
      strategy: 'none',
      mistakes: ['no-attempts'],
      lessons: [],
      cyclesUsed: 0,
      durationMs: Date.now() - startMs,
    };
  }

  // ── Post-task: persist final results, learn, update capabilities ──
  status = 'learning';

  const lessons = extractLessons(task.category as TaskCategory, bestResult);
  bestResult.lessons = lessons;

  // Update task record
  await db.task.update({
    where: { id: taskId },
    data: {
      status: bestResult.success ? 'completed' : 'failed',
      attempt,
      actual: JSON.stringify(bestResult.output ?? null).slice(0, 5000),
      score: bestResult.score,
      mistakes: JSON.stringify(bestResult.mistakes),
      lessons: JSON.stringify(lessons),
      strategy: bestResult.strategy,
      finishedAt: new Date(),
    },
  });

  // Store episodic memory of this experience
  await memory.store(
    'episodic',
    `Task "${task.title}" (${task.category}, diff=${task.difficulty}) — ${
      bestResult.success ? 'SUCCESS' : 'FAILURE'
    } score=${bestResult.score.toFixed(2)} via "${bestResult.strategy}". ${
      bestResult.mistakes.length > 0 ? 'Mistakes: ' + bestResult.mistakes.join('; ') : ''
    }`,
    {
      importance: bestResult.success ? 0.6 + 0.3 * bestResult.score : 0.7,
      source: 'training',
      tags: [task.category, bestResult.success ? 'success' : 'failure'],
    },
  );

  // Update or create skill used
  if (bestResult.strategy && !bestResult.strategy.startsWith('default-')) {
    const skill = await skills.findByName(bestResult.strategy);
    if (skill) {
      await skills.recordUse(skill.id, bestResult.success);
    }
  } else if (bestResult.success && bestResult.score > 0.8) {
    // Successful default-strategy usage → compile a new skill
    await compileSkillFromSuccess(task as { title: string; category: string; description: string; input: string }, bestResult);
  }

  // Update capability score for this category
  await updateCapability(
    task.category as TaskCategory,
    bestResult.success,
    bestResult.score,
    task.difficulty,
  );

  // Final post-task reflection
  await tick(
    'learn',
    { success: bestResult.success, score: bestResult.score },
    { lessons, capabilities: capabilities[task.category as keyof CapabilityMap] },
    `Learned: ${lessons.join('; ')}. Capability[${task.category}]=${capabilities[task.category as keyof CapabilityMap]?.toFixed(2)}`,
    bestResult.score,
    taskId,
  );

  // Periodic memory decay / forgetting
  if (cycle % 50 === 0) {
    await memory.decay();
    await memory.forgetLeastImportant(800);
  }

  currentTaskId = null;
  status = 'idle';
  return bestResult;
}

// ── Verification ──────────────────────────────────────────────────────

function verifyAnswer(actual: unknown, expected: unknown): {
  score: number;
  mistakes: string[];
} {
  const mistakes: string[] = [];

  if (deepEqual(actual, expected)) {
    return { score: 1, mistakes: [] };
  }

  // Partial credit
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const correct = actual.filter((a) => expected.some((e) => deepEqual(a, e))).length;
    const total = Math.max(actual.length, expected.length);
    if (total > 0) {
      const score = correct / total;
      if (score < 1) mistakes.push(`Array mismatch: ${correct}/${total} correct`);
      return { score, mistakes };
    }
  }

  if (typeof actual === 'number' && typeof expected === 'number') {
    const diff = Math.abs(actual - expected);
    if (diff < 1e-9) return { score: 1, mistakes: [] };
    const relError = expected !== 0 ? diff / Math.abs(expected) : diff;
    const score = Math.max(0, 1 - relError);
    mistakes.push(`Numeric mismatch: actual=${actual}, expected=${expected}`);
    return { score, mistakes };
  }

  if (typeof actual === 'string' && typeof expected === 'string') {
    if (actual === expected) return { score: 1, mistakes: [] };
    const correct = [...expected].filter((c, i) => actual[i] === c).length;
    const score = correct / Math.max(expected.length, 1);
    mistakes.push(`String mismatch: actual="${actual}", expected="${expected}"`);
    return { score, mistakes };
  }

  if (typeof actual === 'boolean' && typeof expected === 'boolean') {
    if (actual === expected) return { score: 1, mistakes: [] };
    mistakes.push(`Boolean mismatch: actual=${actual}, expected=${expected}`);
    return { score: 0, mistakes };
  }

  mistakes.push(`Mismatch: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}`);
  return { score: 0, mistakes };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
  }
  return false;
}

// ── Reflection ──────────────────────────────────────────────────────────

export async function reflectOnMistakes(
  taskId: string,
  category: TaskCategory,
  actual: unknown,
  expected: unknown,
  mistakes: string[],
): Promise<Reflection> {
  const findings: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];

  for (const m of mistakes) {
    findings.push(`On "${m}", the chosen strategy produced an incorrect result.`);
    if (m.includes('Array')) weaknesses.push('array-handling');
    if (m.includes('Numeric')) weaknesses.push('arithmetic-precision');
    if (m.includes('String')) weaknesses.push('string-manipulation');
    if (m.includes('Boolean')) weaknesses.push('logical-evaluation');
  }

  if (weaknesses.length === 0) weaknesses.push(`${category}-recall`);

  improvements.push('try alternative strategy on next attempt');
  improvements.push('recall more memories before reasoning');
  improvements.push('decompose the problem into smaller sub-steps');

  const reflection: Reflection = {
    trigger: 'post_task',
    scope: 'task',
    findings,
    weaknesses,
    improvements,
    applied: true,
  };

  await db.reflection.create({
    data: {
      trigger: 'post_task',
      scope: 'task',
      findings: JSON.stringify(findings),
      weaknesses: JSON.stringify(weaknesses),
      improvements: JSON.stringify(improvements),
      applied: true,
    },
  });

  return reflection;
}

// ── Learning ────────────────────────────────────────────────────────────

function extractLessons(category: TaskCategory, result: SolveResult): string[] {
  const lessons: string[] = [];
  if (result.success) {
    lessons.push(`Strategy "${result.strategy}" succeeded on ${category} task (score=${result.score.toFixed(2)}).`);
    if (result.score === 1) {
      lessons.push(`"${result.strategy}" is reliable for this ${category} pattern — promote to skill.`);
    }
  } else {
    lessons.push(`Strategy "${result.strategy}" failed on ${category} task (score=${result.score.toFixed(2)}).`);
    lessons.push(...result.mistakes.map((m) => `Avoid mistake: ${m}`));
    lessons.push(`Next time: try decomposition or alternative strategy for ${category}.`);
  }
  return lessons;
}

async function compileSkillFromSuccess(
  task: { title: string; category: string; description: string; input: string } & Record<string, any>,
  result: SolveResult,
): Promise<void> {
  const skillName = `skill-${task.category}-${Date.now().toString(36)}`;
  await skills.create(
    skillName,
    task.category as TaskCategory,
    `Auto-compiled from successful solve of "${task.title}"`,
    {
      trigger: `Tasks like: ${task.description}`,
      approach: result.strategy,
      steps: result.reasoning.split('\n').slice(0, 5),
    },
  );
  // Newly compiled skills start at mastery 0.5
  const skill = await skills.findByName(skillName);
  if (skill) await skills.recordUse(skill.id, true);
}

async function updateCapability(
  category: TaskCategory,
  success: boolean,
  score: number,
  difficulty: number,
): Promise<void> {
  const current = capabilities[category] ?? 0.2;
  // Weighted update: harder tasks that succeed give bigger gains
  const diffWeight = difficulty / 10; // 0.1..1
  const gain = success
    ? 0.05 * diffWeight * (0.5 + score)
    : -0.02 * (1 - score) * diffWeight;
  const next = Math.max(0.05, Math.min(1, current + gain));
  capabilities[category] = Math.round(next * 1000) / 1000;

  // Also update meta-capabilities
  const lr = capabilities.learning_rate;
  capabilities.learning_rate = Math.round(
    Math.min(1, lr + (success ? 0.005 : 0.002)) * 1000,
  ) / 1000;
  capabilities.adaptability = Math.round(
    Math.min(1, capabilities.adaptability + (success ? 0.003 : 0.001)) * 1000,
  ) / 1000;
  capabilities.self_awareness = Math.round(
    Math.min(1, capabilities.self_awareness + 0.001) * 1000,
  ) / 1000;

  // Persist metrics
  for (const [key, value] of Object.entries(capabilities)) {
    await db.metric.create({
      data: { key: `capability.${key}`, value, cycle },
    });
  }
}

// ── Snapshot / introspection ──────────────────────────────────────────

export async function snapshot(): Promise<BrainSnapshot> {
  const [memoryCount, skillCount, totalTasks, completedTasks] = await Promise.all([
    memory.count(),
    skills.count(),
    db.task.count(),
    db.task.count({ where: { status: 'completed' } }),
  ]);
  const successRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

  return {
    cycle,
    status,
    currentTaskId,
    capabilities: { ...capabilities },
    memoryCount,
    skillCount,
    totalTasks,
    successRate,
    uptime: Date.now() - BOOT_TIME,
  };
}

export async function recentCognitions(limit = 20): Promise<Cognition[]> {
  const recs = await db.cognition.findMany({
    orderBy: { cycle: 'desc' },
    take: limit,
  });
  return recs.map((r) => ({
    id: r.id,
    cycle: r.cycle,
    type: r.type as Cognition['type'],
    input: r.input,
    output: r.output,
    reasoning: r.reasoning,
    confidence: r.confidence,
    taskId: r.taskId ?? undefined,
    createdAt: r.createdAt,
  }));
}

export function getCycle(): number {
  return cycle;
}

export function getStatus(): BrainSnapshot['status'] {
  return status;
}

export function getCapabilities(): CapabilityMap {
  return { ...capabilities };
}

// ── Seed: load capabilities from last metrics ─────────────────────────

export async function loadCapabilitiesFromDB(): Promise<void> {
  const keys = Object.keys(defaultCapabilities);
  for (const key of keys) {
    const last = await db.metric.findFirst({
      where: { key: `capability.${key}` },
      orderBy: { cycle: 'desc' },
    });
    if (last) {
      capabilities[key as keyof CapabilityMap] = last.value;
    }
  }
}

// ── Periodic self-reflection (background) ─────────────────────────────

export async function periodicReflection(): Promise<Reflection> {
  status = 'reflecting';
  const tasks = await db.task.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const recentFailures = tasks.filter((t) => t.status === 'failed');
  const recentSuccesses = tasks.filter((t) => t.status === 'completed');
  const successRate = tasks.length > 0 ? recentSuccesses.length / tasks.length : 0;

  const findings: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];

  findings.push(
    `Recent performance: ${recentSuccesses.length}/${tasks.length} tasks succeeded (rate=${successRate.toFixed(2)}).`,
  );
  findings.push(`Capabilities snapshot: ${JSON.stringify(capabilities)}`);

  // Find weakest capability
  const weakEntries = Object.entries(capabilities).sort((a, b) => a[1] - b[1]);
  const weakest = weakEntries[0];
  if (weakest && weakest[1] < 0.5) {
    weaknesses.push(`${weakest[0]} (mastery ${weakest[1].toFixed(2)})`);
    improvements.push(
      `Increase training on ${weakest[0]} tasks to lift mastery above 0.5`,
    );
  }

  if (recentFailures.length > recentSuccesses.length) {
    findings.push('Failure rate exceeds success rate — review strategies.');
    improvements.push('Lower difficulty of generated training tasks temporarily');
  }

  improvements.push('Continue training across all categories to maintain balance');

  const reflection: Reflection = {
    trigger: 'periodic',
    scope: 'global',
    findings,
    weaknesses,
    improvements,
    applied: true,
  };

  await db.reflection.create({
    data: {
      trigger: 'periodic',
      scope: 'global',
      findings: JSON.stringify(findings),
      weaknesses: JSON.stringify(weaknesses),
      improvements: JSON.stringify(improvements),
      applied: true,
    },
  });

  status = 'idle';
  return reflection;
}

// ── Skill library seeding ──────────────────────────────────────────────

export async function seedCoreSkills(): Promise<void> {
  const existing = await skills.count();
  if (existing > 0) return;

  const seedSkills = [
    {
      name: 'arithmetic-eval',
      category: 'math' as TaskCategory,
      description: 'Tokenize & evaluate arithmetic expressions with operator precedence',
      pattern: { trigger: 'math/arithmetic-expression', approach: 'safe-eval', steps: ['parse', 'evaluate'] },
    },
    {
      name: 'binary-op',
      category: 'math' as TaskCategory,
      description: 'Apply binary arithmetic operations',
      pattern: { trigger: 'math/binary-op', approach: 'dispatch', steps: ['identify', 'compute'] },
    },
    {
      name: 'sequence-extrapolation',
      category: 'math' as TaskCategory,
      description: 'Detect arithmetic/geometric/quadratic/fibonacci patterns',
      pattern: { trigger: 'math/sequence', approach: 'pattern-test', steps: ['diff', 'ratio', 'second-diff', 'recurrence'] },
    },
    {
      name: 'linear-equation-solve',
      category: 'math' as TaskCategory,
      description: 'Rearrange linear equations to isolate x',
      pattern: { trigger: 'math/linear-equation', approach: 'algebraic-rearrange', steps: ['parse', 'collect-x', 'solve'] },
    },
    {
      name: 'syllogism-set-graph',
      category: 'logic' as TaskCategory,
      description: 'Build set-inclusion graph and traverse it',
      pattern: { trigger: 'logic/syllogism', approach: 'graph-traverse', steps: ['build-graph', 'bfs-target'] },
    },
    {
      name: 'propositional-eval',
      category: 'logic' as TaskCategory,
      description: 'Substitute variables and evaluate boolean expression',
      pattern: { trigger: 'logic/propositional', approach: 'substitution-eval', steps: ['substitute', 'eval'] },
    },
    {
      name: 'set-operation',
      category: 'logic' as TaskCategory,
      description: 'Union / intersection / difference / symmetric difference',
      pattern: { trigger: 'logic/set-op', approach: 'set-algebra', steps: ['identify-op', 'apply'] },
    },
    {
      name: 'analogy-relation-transfer',
      category: 'language' as TaskCategory,
      description: 'Detect relation between example pair & apply to question',
      pattern: { trigger: 'language/analogy', approach: 'relation-transfer', steps: ['detect', 'apply'] },
    },
    {
      name: 'string-pattern-completion',
      category: 'language' as TaskCategory,
      description: 'Complete patterns by detecting repetition period',
      pattern: { trigger: 'language/pattern', approach: 'period-detect', steps: ['test-periods', 'predict'] },
    },
    {
      name: 'bfs-pathfinding',
      category: 'planning' as TaskCategory,
      description: 'BFS for shortest path in unweighted graph',
      pattern: { trigger: 'planning/pathfinding', approach: 'bfs', steps: ['init', 'expand', 'terminate'] },
    },
    {
      name: 'topological-schedule',
      category: 'planning' as TaskCategory,
      description: 'Order tasks respecting dependencies',
      pattern: { trigger: 'planning/scheduling', approach: 'topo-sort', steps: ['visit-deps', 'emit'] },
    },
    {
      name: 'multi-step-chain',
      category: 'reasoning' as TaskCategory,
      description: 'Break complex task into sub-steps and combine',
      pattern: { trigger: 'reasoning/multi-step', approach: 'decompose-combine', steps: ['decompose', 'solve-each', 'combine'] },
    },
  ];

  for (const s of seedSkills) {
    await skills.create(s.name, s.category, s.description, s.pattern);
  }
}

// ── Seed: bootstrap knowledge ──────────────────────────────────────────

export async function seedCoreKnowledge(): Promise<void> {
  if ((await knowledge.count()) > 0) return;

  const facts: Array<[string, string, string, number]> = [
    ['brain', 'has', 'cognitive-modules', 1],
    ['brain', 'uses', 'memory-system', 1],
    ['brain', 'uses', 'reasoning-engine', 1],
    ['brain', 'uses', 'skill-store', 1],
    ['brain', 'uses', 'knowledge-base', 1],
    ['memory', 'has-kinds', 'working-episodic-semantic-procedural', 0.9],
    ['skill', 'has', 'mastery-score', 1],
    ['learning', 'happens-on', 'mistakes-and-successes', 1],
    ['reflection', 'improves', 'self-awareness', 0.9],
    ['arithmetic', 'is-a', 'math-operation', 1],
    ['syllogism', 'is-a', 'logic-pattern', 1],
    ['analogy', 'is-a', 'language-task', 1],
    ['pathfinding', 'uses', 'breadth-first-search', 0.95],
  ];
  for (const [s, p, o, c] of facts) {
    await knowledge.assert(s, p, o, c, 'seed');
  }
}
