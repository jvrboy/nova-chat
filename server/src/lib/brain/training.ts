/**
 * Training Harness
 * ─────────────────
 * Generates graded tasks across all 7 categories, runs the Brain through
 * them, evaluates results, and reports progress per capability.
 *
 * This is the Brain's gym. It can be run as a one-shot or as a multi-round
 * "training session" that progressively increases difficulty.
 */

import { db } from './db';
import { solveTask } from './core';
import type { CapabilityMap, SolveResult, TaskCategory } from './types';

// ── Task generator ─────────────────────────────────────────────────────

export interface GeneratedTask {
  title: string;
  description: string;
  category: TaskCategory;
  difficulty: number; // 1..10
  input: any;
  expected: any;
}

const rng = (seed: { v: number }) => {
  // xorshift32 — deterministic given seed
  seed.v ^= seed.v << 13;
  seed.v ^= seed.v >>> 17;
  seed.v ^= seed.v << 5;
  return ((seed.v >>> 0) % 1_000_000) / 1_000_000;
};

export function generateTask(
  category: TaskCategory,
  difficulty: number,
  seed: { v: number },
): GeneratedTask {
  switch (category) {
    case 'math':
      return genMathTask(difficulty, seed);
    case 'logic':
      return genLogicTask(difficulty, seed);
    case 'language':
      return genLanguageTask(difficulty, seed);
    case 'planning':
      return genPlanningTask(difficulty, seed);
    case 'coding':
      return genCodingTask(difficulty, seed);
    case 'creative':
      return genCreativeTask(difficulty, seed);
    case 'reasoning':
      return genReasoningTask(difficulty, seed);
  }
}

function randInt(seed: { v: number }, min: number, max: number): number {
  return Math.floor(rng(seed) * (max - min + 1)) + min;
}

function pick<T>(arr: T[], seed: { v: number }): T {
  return arr[Math.floor(rng(seed) * arr.length)];
}

// ── Math task generator ────────────────────────────────────────────────

function genMathTask(difficulty: number, seed: { v: number }): GeneratedTask {
  const variant = Math.floor(rng(seed) * 4);
  if (variant === 0) {
    // arithmetic expression
    const ops = difficulty < 4 ? ['+', '-'] : difficulty < 7 ? ['+', '-', '*'] : ['+', '-', '*', '/'];
    const a = randInt(seed, 1, 10 * difficulty);
    const b = randInt(seed, 1, 10 * difficulty);
    const c = randInt(seed, 1, 10 * difficulty);
    const op1 = pick(ops, seed);
    const op2 = pick(ops, seed);
    const expr = `${a} ${op1} ${b} ${op2} ${c}`;
    // compute expected
    const safe = expr.replace(/\//g, '/');
     
    const expected = Function(`"use strict"; return (${safe})`)();
    return {
      title: `Evaluate: ${expr}`,
      description: `Compute the arithmetic expression.`,
      category: 'math',
      difficulty,
      input: expr,
      expected: Math.round(expected * 1e10) / 1e10,
    };
  } else if (variant === 1) {
    // binary op
    const ops = ['+', '-', '*', '%'];
    const op = pick(ops, seed);
    const a = randInt(seed, 1, 100 * difficulty);
    const b = randInt(seed, 1, 100 * difficulty);
    let expected!: number;
    switch (op) {
      case '+': expected = a + b; break;
      case '-': expected = a - b; break;
      case '*': expected = a * b; break;
      case '%': expected = b === 0 ? 0 : a % b; break;
    }
    return {
      title: `${a} ${op} ${b} = ?`,
      description: `Compute the binary operation.`,
      category: 'math',
      difficulty,
      input: { a, b, op },
      expected,
    };
  } else if (variant === 2) {
    // sequence
    const start = randInt(seed, 1, 10);
    const diff = randInt(seed, 1, 10);
    const seq = [start, start + diff, start + 2 * diff, start + 3 * diff];
    return {
      title: `What comes next: ${seq.join(', ')}, ?`,
      description: `Predict the next term in the sequence.`,
      category: 'math',
      difficulty,
      input: { seq },
      expected: start + 4 * diff,
    };
  } else {
    // linear equation "x + b = c"
    const x = randInt(seed, 1, 20);
    const b = randInt(seed, -10, 10);
    const c = x + b;
    const eq = `x + ${b} = ${c}`;
    return {
      title: `Solve for x: ${eq}`,
      description: `Find x that satisfies the equation.`,
      category: 'math',
      difficulty,
      input: { equation: eq },
      expected: x,
    };
  }
}

// ── Logic task generator ───────────────────────────────────────────────

function genLogicTask(difficulty: number, seed: { v: number }): GeneratedTask {
  const variant = Math.floor(rng(seed) * 3);
  if (variant === 0) {
    // syllogism
    const cats = ['cat', 'dog', 'mammal', 'animal', 'bird', 'fish', 'creature'];
    const a = pick(cats, seed), b = pick(cats, seed), c = pick(cats, seed);
    const premises = [`all ${a} are ${b}`, `all ${b} are ${c}`];
    const question = `is ${a} a ${c}?`;
    return {
      title: `Syllogism: ${premises.join('; ')} → ${question}`,
      description: `Apply transitive reasoning.`,
      category: 'logic',
      difficulty,
      input: { premises, question },
      expected: true, // by construction, transitive
    };
  } else if (variant === 1) {
    // propositional
    const vars = { p: rng(seed) > 0.5, q: rng(seed) > 0.5, r: rng(seed) > 0.5 };
    const ops = ['p and q', 'p or q', 'not p', 'p and (q or r)', '(p or q) and not r', 'p or not q'];
    const expr = pick(ops, seed);
    // evaluate
    const subbed = expr
      .replace(/\bp\b/g, String(vars.p))
      .replace(/\bq\b/g, String(vars.q))
      .replace(/\br\b/g, String(vars.r))
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/\bnot\b/g, '!');
     
    const expected = !!Function(`"use strict"; return (${subbed})`)();
    return {
      title: `Evaluate: ${expr} where p=${vars.p}, q=${vars.q}, r=${vars.r}`,
      description: `Substitute and evaluate the propositional expression.`,
      category: 'logic',
      difficulty,
      input: { expr, vars },
      expected,
    };
  } else {
    // set operations
    const a = Array.from(new Set([randInt(seed, 1, 10), randInt(seed, 1, 10), randInt(seed, 1, 10)]));
    const b = Array.from(new Set([randInt(seed, 1, 10), randInt(seed, 1, 10), randInt(seed, 1, 10)]));
    const ops = ['union', 'intersection', 'difference'];
    const op = pick(ops, seed);
    let expected!: number[];
    switch (op) {
      case 'union': expected = Array.from(new Set([...a, ...b])); break;
      case 'intersection': expected = a.filter((x) => b.includes(x)); break;
      case 'difference': expected = a.filter((x) => !b.includes(x)); break;
    }
    expected.sort((x, y) => x - y);
    return {
      title: `${op}([${a.join(',')}], [${b.join(',')}])`,
      description: `Perform the set operation.`,
      category: 'logic',
      difficulty,
      input: { op, a, b },
      expected,
    };
  }
}

// ── Language task generator ────────────────────────────────────────────

function genLanguageTask(difficulty: number, seed: { v: number }): GeneratedTask {
  const variant = Math.floor(rng(seed) * 2);
  if (variant === 0) {
    // string pattern: a,b,c,?, options
    const startCharCode = randInt(seed, 97, 100); // a-d
    const seq = [
      String.fromCharCode(startCharCode),
      String.fromCharCode(startCharCode + 1),
      String.fromCharCode(startCharCode + 2),
      null,
    ];
    const expected = String.fromCharCode(startCharCode + 3);
    const options = ['w', 'x', 'y', 'z', expected];
    return {
      title: `Complete: ${seq.map((s) => s ?? '?').join(', ')}`,
      description: `Find the next item in the string sequence.`,
      category: 'language',
      difficulty,
      input: { seq, options },
      expected,
    };
  } else {
    // classification
    const categories = {
      fruit: ['apple', 'banana', 'orange', 'grape'],
      animal: ['dog', 'cat', 'horse', 'cow'],
      color: ['red', 'blue', 'green', 'yellow'],
    };
    const items = ['pear', 'lemon', 'tiger', 'purple'];
    return {
      title: `Classify: ${items.join(', ')}`,
      description: `Classify each item into the most similar category.`,
      category: 'language',
      difficulty,
      input: { items, categories },
      expected: {
        fruit: ['pear', 'lemon'],
        animal: ['tiger'],
        color: ['purple'],
      },
    };
  }
}

// ── Planning task generator ────────────────────────────────────────────

function genPlanningTask(difficulty: number, seed: { v: number }): GeneratedTask {
  const variant = Math.floor(rng(seed) * 2);
  if (variant === 0) {
    // pathfinding
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F'];
    const graph: Record<string, string[]> = {};
    for (const n of nodes) graph[n] = [];
    const edges: [string, string][] = [
      ['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E'], ['E', 'F'],
    ];
    for (const [a, b] of edges) {
      graph[a].push(b);
      graph[b].push(a);
    }
    return {
      title: `Find path: A → F`,
      description: `Find shortest path through graph.`,
      category: 'planning',
      difficulty,
      input: { graph, start: 'A', goal: 'F' },
      expected: ['A', 'C', 'D', 'E', 'F'],
    };
  } else {
    // scheduling
    const tasks = [
      { name: 'design', duration: 2, deps: [] as string[] },
      { name: 'build', duration: 4, deps: ['design'] },
      { name: 'test', duration: 2, deps: ['build'] },
      { name: 'deploy', duration: 1, deps: ['test'] },
    ];
    const expectedOrder = ['design', 'build', 'test', 'deploy'];
    return {
      title: `Schedule tasks respecting dependencies`,
      description: `Order: design → build → test → deploy. Total = 9.`,
      category: 'planning',
      difficulty,
      input: { tasks, timeLimit: 10 },
      expected: { order: expectedOrder, total: 9, fits: true },
    };
  }
}

// ── Coding task generator ──────────────────────────────────────────────

function genCodingTask(difficulty: number, seed: { v: number }): GeneratedTask {
  const variant = Math.floor(rng(seed) * 5);
  if (variant === 0) {
    const s = pick(['hello', 'world', 'brain', 'cognition', 'neural'], seed);
    return {
      title: `Reverse the string: "${s}"`,
      description: `Return the reversed string.`,
      category: 'coding',
      difficulty,
      input: { op: 'reverse', s },
      expected: [...s].reverse().join(''),
    };
  } else if (variant === 1) {
    const n = randInt(seed, 5, 20);
    const expected: string[] = [];
    for (let i = 1; i <= n; i++) {
      if (i % 15 === 0) expected.push('FizzBuzz');
      else if (i % 3 === 0) expected.push('Fizz');
      else if (i % 5 === 0) expected.push('Buzz');
      else expected.push(String(i));
    }
    return {
      title: `FizzBuzz up to ${n}`,
      description: `Generate FizzBuzz sequence.`,
      category: 'coding',
      difficulty,
      input: { op: 'fizzbuzz', n },
      expected,
    };
  } else if (variant === 2) {
    const arr = [randInt(seed, 1, 50), randInt(seed, 1, 50), randInt(seed, 1, 50), randInt(seed, 1, 50)];
    return {
      title: `Sum: [${arr.join(', ')}]`,
      description: `Return the sum.`,
      category: 'coding',
      difficulty,
      input: { op: 'sum', arr },
      expected: arr.reduce((a, b) => a + b, 0),
    };
  } else if (variant === 3) {
    const s = pick(['racecar', 'hello', 'level', 'world', 'madam'], seed);
    return {
      title: `Is "${s}" a palindrome?`,
      description: `Check whether the string reads the same forwards and backwards.`,
      category: 'coding',
      difficulty,
      input: { op: 'palindrome', s },
      expected: s === [...s].reverse().join(''),
    };
  } else {
    const arr = [randInt(seed, 1, 50), randInt(seed, 1, 50), randInt(seed, 1, 50), randInt(seed, 1, 50), randInt(seed, 1, 50)];
    return {
      title: `Sort ascending: [${arr.join(', ')}]`,
      description: `Return the array sorted in ascending order.`,
      category: 'coding',
      difficulty,
      input: { op: 'sort', arr },
      expected: [...arr].sort((a, b) => a - b),
    };
  }
}

// ── Creative task generator ────────────────────────────────────────────

function genCreativeTask(difficulty: number, seed: { v: number }): GeneratedTask {
  const variant = Math.floor(rng(seed) * 3);
  if (variant === 0) {
    const s = pick(['ab', 'abc', 'xy', 'cat'], seed);
    const expected = permutations(s);
    return {
      title: `All permutations of "${s}"`,
      description: `Generate all unique permutations.`,
      category: 'creative',
      difficulty,
      input: { op: 'permutations', s },
      expected,
    };
  } else if (variant === 1) {
    const arr = ['a', 'b', 'c', 'd'];
    const k = 2;
    const expected = combinations(arr, k);
    return {
      title: `Combinations of [${arr.join(',')}] choose ${k}`,
      description: `Generate all 2-element combinations.`,
      category: 'creative',
      difficulty,
      input: { op: 'combinations', arr, k },
      expected,
    };
  } else {
    const words = pick([
      ['Hyper', 'Text', 'Markup', 'Language'],
      ['World', 'Health', 'Organization'],
      ['Artificial', 'Intelligence'],
    ], seed);
    return {
      title: `Acronym of "${words.join(' ')}"`,
      description: `Take first letter of each word, uppercase.`,
      category: 'creative',
      difficulty,
      input: { op: 'acronym', words },
      expected: words.map((w) => w[0]?.toUpperCase() ?? '').join(''),
    };
  }
}

function permutations(s: string): string[] {
  if (s.length <= 1) return [s];
  const result: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const rest = s.slice(0, i) + s.slice(i + 1);
    for (const p of permutations(rest)) result.push(s[i] + p);
  }
  return Array.from(new Set(result)).sort();
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// ── Reasoning task generator (multi-step) ──────────────────────────────

function genReasoningTask(difficulty: number, seed: { v: number }): GeneratedTask {
  // Compose two math steps + combine
  const a = randInt(seed, 1, 20);
  const b = randInt(seed, 1, 20);
  const c = randInt(seed, 1, 20);
  const expected = (a + b) * c;
  return {
    title: `Multi-step: (a + b) × c where a=${a}, b=${b}, c=${c}`,
    description: `First compute a+b, then multiply by c.`,
    category: 'reasoning',
    difficulty,
    input: {
      steps: [
        { type: 'math' as TaskCategory, input: { a, b, op: '+' } },
        { type: 'math' as TaskCategory, input: { a: a + b, b: c, op: '*' } },
      ],
      combine: 'last',
    },
    expected,
  };
}

// ── Training session runner ───────────────────────────────────────────

export interface TrainingSessionConfig {
  rounds: number;
  categories: TaskCategory[];
  difficultyStart: number;
  difficultyEnd: number;
  seed?: number;
}

export interface TrainingSessionResult {
  sessionId: string;
  totalTasks: number;
  succeeded: number;
  failed: number;
  avgScore: number;
  byCategory: Record<TaskCategory, { total: number; success: number; avgScore: number }>;
  results: SolveResult[];
  capabilitiesBefore: CapabilityMap;
  capabilitiesAfter: CapabilityMap;
  durationMs: number;
}

export async function runTrainingSession(
  config: TrainingSessionConfig,
): Promise<TrainingSessionResult> {
  const t0 = Date.now();
  const seed = { v: config.seed ?? Math.floor(Math.random() * 1_000_000) + 1 };
  const results: SolveResult[] = [];
  const byCategory = {} as Record<TaskCategory, { total: number; success: number; avgScore: number }>;
  for (const cat of config.categories) {
    byCategory[cat] = { total: 0, success: 0, avgScore: 0 };
  }

  // Snapshot capabilities before
  const { getCapabilities } = await import('./core');
  const capabilitiesBefore = getCapabilities();

  // Create training run record
  const run = await db.trainingRun.create({
    data: {
      name: `Training-${new Date().toISOString()}`,
      taskCount: config.rounds * config.categories.length,
      capabilities: JSON.stringify(capabilitiesBefore),
      startedAt: new Date(),
    },
  });

  for (let round = 0; round < config.rounds; round++) {
    const progress = round / Math.max(1, config.rounds - 1);
    const difficulty = Math.round(
      config.difficultyStart + (config.difficultyEnd - config.difficultyStart) * progress,
    );
    for (const cat of config.categories) {
      const gen = generateTask(cat, difficulty, seed);
      // Persist the task
      const task = await db.task.create({
        data: {
          title: gen.title,
          description: gen.description,
          category: gen.category,
          difficulty: gen.difficulty,
          input: JSON.stringify(gen.input),
          expected: JSON.stringify(gen.expected),
          status: 'pending',
          maxAttempts: 3,
        },
      });
      const result = await solveTask(task.id);
      results.push(result);
      byCategory[cat].total++;
      if (result.success) byCategory[cat].success++;
      byCategory[cat].avgScore += result.score;
    }
  }

  // Compute averages
  for (const cat of config.categories) {
    if (byCategory[cat].total > 0) {
      byCategory[cat].avgScore /= byCategory[cat].total;
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / Math.max(1, results.length);

  const capabilitiesAfter = getCapabilities();

  // Update training run
  await db.trainingRun.update({
    where: { id: run.id },
    data: {
      successCount: succeeded,
      failureCount: failed,
      avgScore,
      capabilities: JSON.stringify(capabilitiesAfter),
      finishedAt: new Date(),
    },
  });

  return {
    sessionId: run.id,
    totalTasks: results.length,
    succeeded,
    failed,
    avgScore,
    byCategory,
    results,
    capabilitiesBefore,
    capabilitiesAfter,
    durationMs: Date.now() - t0,
  };
}

// ── Submit a single user-defined task ─────────────────────────────────

export async function submitUserTask(
  title: string,
  description: string,
  category: TaskCategory,
  difficulty: number,
  input: any,
  expected: any | null,
): Promise<SolveResult> {
  const task = await db.task.create({
    data: {
      title,
      description,
      category,
      difficulty,
      input: JSON.stringify(input),
      expected: expected !== null ? JSON.stringify(expected) : null,
      status: 'pending',
      maxAttempts: 3,
    },
  });
  return solveTask(task.id);
}
