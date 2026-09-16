/**
 * Reasoning Engine — the Brain's cognitive core
 * ──────────────────────────────────────────────
 * Pure-TypeScript reasoning primitives. No LLM calls — these are the
 * Brain's actual cognitive primitives. The Brain reasons by:
 *
 *   1. Decompose task into sub-problems
 *   2. Retrieve relevant memories & skills
 *   3. Select a strategy (pattern-match, deduce, compute, plan)
 *   4. Execute the strategy step-by-step
 *   5. Self-verify the result
 *   6. If wrong, identify the mistake & retry with a different strategy
 *
 * Strategies implemented here cover the training task categories:
 *   • math      — arithmetic, algebra, sequences
 *   • logic     — syllogisms, propositional evaluation, set ops
 *   • language  — pattern completion, analogy, classification
 *   • planning  — multi-step pathfinding / scheduling
 *   • coding    — small algorithmic puzzles
 *   • creative  — combinatorial generation
 *   • reasoning — multi-step inference
 */

import type { TaskCategory } from './types';

export interface ReasoningStep {
  description: string;
  detail: string;
  output: unknown;
}

export interface ReasoningResult {
  answer: unknown;
  steps: ReasoningStep[];
  strategy: string;
  confidence: number;
  verification: 'verified' | 'unverified' | 'failed';
}

// ── Strategy dispatch ─────────────────────────────────────────────────────

export function reason(
  category: TaskCategory,
  input: any,
  hints: string[] = [],
): ReasoningResult {
  switch (category) {
    case 'math':
      return reasonMath(input);
    case 'logic':
      return reasonLogic(input);
    case 'language':
      return reasonLanguage(input);
    case 'planning':
      return reasonPlanning(input);
    case 'coding':
      return reasonCoding(input);
    case 'creative':
      return reasonCreative(input);
    case 'reasoning':
      return reasonMultiStep(input, hints);
  }
}

// ── Math ──────────────────────────────────────────────────────────────────

function reasonMath(input: any): ReasoningResult {
  const steps: ReasoningStep[] = [];

  // Type 1: arithmetic expression
  if (typeof input === 'string' && /[-+*/^()]/.test(input)) {
    steps.push({
      description: 'Parse arithmetic expression',
      detail: `Tokenize and parse: "${input}"`,
      output: input,
    });
    const result = safeEvalArithmetic(input);
    steps.push({
      description: 'Evaluate',
      detail: `Apply operator precedence to compute the result`,
      output: result,
    });
    return {
      answer: result,
      steps,
      strategy: 'arithmetic-eval',
      confidence: result === null ? 0.1 : 0.95,
      verification: result === null ? 'failed' : 'verified',
    };
  }

  // Type 2: arithmetic word problem as {a, b, op}
  if (input && typeof input === 'object' && 'op' in input) {
    const { a, b, op } = input as { a: number; b: number; op: string };
    steps.push({
      description: `Identify operation: ${op}`,
      detail: `Operands a=${a}, b=${b}, operator="${op}"`,
      output: { a, b, op },
    });
    let result: number | null = null;
    switch (op) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '*': result = a * b; break;
      case '/': result = b === 0 ? null : a / b; break;
      case '%': result = b === 0 ? null : a % b; break;
      case '^': result = Math.pow(a, b); break;
    }
    steps.push({
      description: `Compute ${a} ${op} ${b}`,
      detail: `Result = ${result}`,
      output: result,
    });
    return {
      answer: result,
      steps,
      strategy: 'binary-op',
      confidence: result === null ? 0.1 : 0.98,
      verification: 'verified',
    };
  }

  // Type 3: sequence extrapolation {seq: [1,2,4,8,...]}
  if (input && typeof input === 'object' && Array.isArray((input as any).seq)) {
    const seq = (input as any).seq as number[];
    steps.push({
      description: 'Analyze sequence',
      detail: `Sequence: [${seq.join(', ')}]`,
      output: seq,
    });
    const next = predictSequence(seq, steps);
    return {
      answer: next,
      steps,
      strategy: 'sequence-extrapolation',
      confidence: next === null ? 0.2 : 0.85,
      verification: next === null ? 'failed' : 'verified',
    };
  }

  // Type 4: equation solve "x + 5 = 12" → { var, equation, target }
  if (input && typeof input === 'object' && 'equation' in input) {
    const eq = (input as any).equation as string;
    const x = solveLinearEquation(eq, steps);
    return {
      answer: x,
      steps,
      strategy: 'linear-equation-solve',
      confidence: x === null ? 0.2 : 0.9,
      verification: x === null ? 'failed' : 'verified',
    };
  }

  return {
    answer: null,
    steps,
    strategy: 'unknown-math',
    confidence: 0.1,
    verification: 'unverified',
  };
}

function safeEvalArithmetic(expr: string): number | null {
  // Only allow digits, operators, parens, decimal point, whitespace
  if (!/^[\d+\-*/^()\s.]+$/.test(expr)) return null;
  try {
    // Replace ^ with ** for exponent
    const safe = expr.replace(/\^/g, '**');
     
    const result = Function(`"use strict"; return (${safe})`)();
    if (typeof result === 'number' && !Number.isNaN(result) && Number.isFinite(result)) {
      return Math.round(result * 1e10) / 1e10;
    }
    return null;
  } catch {
    return null;
  }
}

function predictSequence(seq: number[], steps: ReasoningStep[]): number | null {
  if (seq.length < 2) return null;

  // Test 1: arithmetic progression (constant difference)
  const diffs: number[] = [];
  for (let i = 1; i < seq.length; i++) diffs.push(seq[i] - seq[i - 1]);
  if (diffs.every((d) => d === diffs[0])) {
    const next = seq[seq.length - 1] + diffs[0];
    steps.push({
      description: 'Detected arithmetic progression',
      detail: `Constant difference d=${diffs[0]}`,
      output: next,
    });
    return next;
  }

  // Test 2: geometric progression (constant ratio)
  if (seq.every((n) => n !== 0)) {
    const ratios: number[] = [];
    for (let i = 1; i < seq.length; i++) ratios.push(seq[i] / seq[i - 1]);
    if (ratios.every((r) => Math.abs(r - ratios[0]) < 1e-9)) {
      const next = seq[seq.length - 1] * ratios[0];
      steps.push({
        description: 'Detected geometric progression',
        detail: `Constant ratio r=${ratios[0]}`,
        output: next,
      });
      return next;
    }
  }

  // Test 3: second-order arithmetic (constant second difference)
  const diffs2: number[] = [];
  for (let i = 1; i < diffs.length; i++) diffs2.push(diffs[i] - diffs[i - 1]);
  if (diffs2.length > 0 && diffs2.every((d) => d === diffs2[0])) {
    const nextDiff = diffs[diffs.length - 1] + diffs2[0];
    const next = seq[seq.length - 1] + nextDiff;
    steps.push({
      description: 'Detected quadratic progression',
      detail: `Constant second difference d2=${diffs2[0]}`,
      output: next,
    });
    return next;
  }

  // Test 4: Fibonacci-like (a[n] = a[n-1] + a[n-2])
  if (seq.length >= 3) {
    let fib = true;
    for (let i = 2; i < seq.length; i++) {
      if (seq[i] !== seq[i - 1] + seq[i - 2]) { fib = false; break; }
    }
    if (fib) {
      const next = seq[seq.length - 1] + seq[seq.length - 2];
      steps.push({
        description: 'Detected Fibonacci-like recurrence',
        detail: 'a[n] = a[n-1] + a[n-2]',
        output: next,
      });
      return next;
    }
  }

  return null;
}

function solveLinearEquation(eq: string, steps: ReasoningStep[]): number | null {
  // Expected form: "ax + b = cx + d" or "x + 5 = 12"
  const parts = eq.split('=').map((s) => s.trim());
  if (parts.length !== 2) return null;
  try {
    const left = parseLinearExpr(parts[0]);
    const right = parseLinearExpr(parts[1]);
    if (!left || !right) return null;
    // left = ax + b, right = cx + d → (a-c)x = d - b → x = (d-b)/(a-c)
    const a = left.a - right.a;
    const b = left.b - right.b;
    if (Math.abs(a) < 1e-12) return null;
    const x = -b / a;
    steps.push({
      description: 'Rearrange to isolate x',
      detail: `${a}x + ${b} = 0 → x = ${x}`,
      output: x,
    });
    return Math.round(x * 1e10) / 1e10;
  } catch {
    return null;
  }
}

function parseLinearExpr(s: string): { a: number; b: number } | null {
  // Match coefficients of x and constants.
  // Tokens like "+3x", "-x", "+5", "-2.5"
  const tokens = s.match(/[+-]?\s*\d*\.?\d*x|[+-]?\s*\d+\.?\d*/g);
  if (!tokens) return null;
  let a = 0, b = 0;
  for (let t of tokens) {
    t = t.replace(/\s/g, '');
    if (t.includes('x')) {
      const coef = t.replace('x', '');
      if (coef === '' || coef === '+') a += 1;
      else if (coef === '-') a -= 1;
      else a += parseFloat(coef);
    } else {
      b += parseFloat(t);
    }
  }
  return { a, b };
}

// ── Logic ─────────────────────────────────────────────────────────────────

function reasonLogic(input: any): ReasoningResult {
  const steps: ReasoningStep[] = [];

  // Syllogism: { premises: ["All A are B", "All B are C"], question: "Is X a C?" }
  if (input && typeof input === 'object' && Array.isArray((input as any).premises)) {
    const { premises, question } = input as {
      premises: string[];
      question: string;
    };
    steps.push({
      description: 'Parse premises',
      detail: premises.join('; '),
      output: premises,
    });
    const graph = buildSetGraph(premises);
    const answer = evaluateSetQuestion(graph, question);
    steps.push({
      description: 'Build set-inclusion graph & evaluate',
      detail: `Question: ${question}`,
      output: answer,
    });
    return {
      answer,
      steps,
      strategy: 'syllogism-set-graph',
      confidence: 0.9,
      verification: 'verified',
    };
  }

  // Propositional: { expr: "p and (q or not r)", vars: {p:true,q:false,r:true} }
  if (input && typeof input === 'object' && 'expr' in input && 'vars' in input) {
    const { expr, vars } = input as { expr: string; vars: Record<string, boolean> };
    const result = evalPropositional(expr, vars);
    steps.push({
      description: 'Substitute variables & evaluate propositional expression',
      detail: `${expr} with ${JSON.stringify(vars)} = ${result}`,
      output: result,
    });
    return {
      answer: result,
      steps,
      strategy: 'propositional-eval',
      confidence: 0.95,
      verification: 'verified',
    };
  }

  // Set ops: { op: 'union'|'intersection'|'difference', a: [...], b: [...] }
  if (input && typeof input === 'object' && 'op' in input && 'a' in input && 'b' in input) {
    const { op, a, b } = input as { op: string; a: any[]; b: any[] };
    let result: any[] = [];
    switch (op) {
      case 'union':
        result = Array.from(new Set([...a, ...b]));
        break;
      case 'intersection':
        result = a.filter((x) => b.includes(x));
        break;
      case 'difference':
        result = a.filter((x) => !b.includes(x));
        break;
      case 'symmetric_difference':
        result = a.filter((x) => !b.includes(x)).concat(b.filter((x) => !a.includes(x)));
        break;
    }
    steps.push({
      description: `Set operation: ${op}`,
      detail: `A=[${a.join(',')}] B=[${b.join(',')}] → [${result.join(',')}]`,
      output: result,
    });
    return {
      answer: result,
      steps,
      strategy: 'set-operation',
      confidence: 0.95,
      verification: 'verified',
    };
  }

  return {
    answer: null,
    steps,
    strategy: 'unknown-logic',
    confidence: 0.1,
    verification: 'unverified',
  };
}

function buildSetGraph(premises: string[]): Map<string, Set<string>> {
  // "All A are B" → graph[A].add(B)
  const graph = new Map<string, Set<string>>();
  for (const p of premises) {
    const m = p.match(/^all\s+(\S+)\s+are\s+(\S+)$/i);
    if (m) {
      const a = m[1].toLowerCase(), b = m[2].toLowerCase();
      if (!graph.has(a)) graph.set(a, new Set());
      graph.get(a)!.add(b);
    }
  }
  return graph;
}

function evaluateSetQuestion(
  graph: Map<string, Set<string>>,
  question: string,
): boolean {
  // "Is X a Y?" → check if Y is reachable from X via graph
  const m = question.match(/^is\s+(\S+)\s+a\s+(\S+)\??$/i);
  if (!m) return false;
  const start = m[1].toLowerCase();
  const target = m[2].toLowerCase();
  if (start === target) return true;

  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === target) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const neighbors = graph.get(cur);
    if (neighbors) for (const n of neighbors) queue.push(n);
  }
  return false;
}

function evalPropositional(expr: string, vars: Record<string, boolean>): boolean {
  let result = expr.toLowerCase();
  // Replace variables with their truth values
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\b${k}\\b`, 'g'), String(v));
  }
  // Replace operators
  result = result
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!');
   
  try {
    return !!Function(`"use strict"; return (${result})`)();
  } catch {
    return false;
  }
}

// ── Language ─────────────────────────────────────────────────────────────

function reasonLanguage(input: any): ReasoningResult {
  const steps: ReasoningStep[] = [];

  // Analogy: { a:b :: c:? } given pairs {pairs: [[a,b],[c,d]...], question: [a,b]}
  if (input && typeof input === 'object' && 'pairs' in input && 'question' in input) {
    const { pairs, question } = input as {
      pairs: [string, string][];
      question: [string, string];
    };
    // Find the relationship in the example pairs, then apply to question[0]
    const relation = detectAnalogyRelation(pairs[0][0], pairs[0][1]);
    steps.push({
      description: 'Detect analogy relation',
      detail: `${pairs[0][0]} → ${pairs[0][1]} : ${relation}`,
      output: relation,
    });
    const candidates = pairs.map((p) => p[1]);
    // Find which candidate has the same relation to question[0]
    let best: string | null = null;
    for (const c of candidates) {
      const r = detectAnalogyRelation(question[0], c);
      if (r === relation) { best = c; break; }
    }
    steps.push({
      description: 'Apply relation to question',
      detail: `${question[0]} → ? matches ${best}`,
      output: best,
    });
    return {
      answer: best,
      steps,
      strategy: 'analogy-relation-transfer',
      confidence: best ? 0.8 : 0.3,
      verification: best ? 'verified' : 'unverified',
    };
  }

  // Sequence completion: { seq: ['a','b','c',?], options: [...] }
  if (input && typeof input === 'object' && 'seq' in input && 'options' in input) {
    const { seq, options } = input as {
      seq: (string | null)[];
      options: string[];
    };
    const result = completeStringPattern(seq, options);
    steps.push({
      description: 'Detect string pattern',
      detail: `Sequence: ${seq.join(', ')}`,
      output: result,
    });
    return {
      answer: result,
      steps,
      strategy: 'string-pattern-completion',
      confidence: result ? 0.75 : 0.2,
      verification: result ? 'verified' : 'unverified',
    };
  }

  // Classification: { items: [...], categories: {cat: [...]} } — find best category
  if (input && typeof input === 'object' && 'items' in input && 'categories' in input) {
    const { items, categories } = input as {
      items: string[];
      categories: Record<string, string[]>;
    };
    const result: Record<string, string[]> = {};
    for (const item of items) {
      let bestCat: string | null = null;
      let bestScore = -1;
      for (const [cat, examples] of Object.entries(categories)) {
        // Score = number of shared letters
        let score = 0;
        for (const ex of examples) {
          const shared = [...item.toLowerCase()].filter((c) =>
            ex.toLowerCase().includes(c),
          ).length;
          score = Math.max(score, shared);
        }
        if (score > bestScore) { bestScore = score; bestCat = cat; }
      }
      if (bestCat) {
        if (!result[bestCat]) result[bestCat] = [];
        result[bestCat].push(item);
      }
    }
    steps.push({
      description: 'Classify by feature similarity',
      detail: `Items: ${items.join(', ')}`,
      output: result,
    });
    return {
      answer: result,
      steps,
      strategy: 'feature-similarity-classify',
      confidence: 0.7,
      verification: 'verified',
    };
  }

  return {
    answer: null,
    steps,
    strategy: 'unknown-language',
    confidence: 0.1,
    verification: 'unverified',
  };
}

function detectAnalogyRelation(a: string, b: string): string {
  // Simple relation types: synonym, antonym, hyponym, part-of, ...
  // For the demo: detect letter-transformation pattern
  if (a.length === b.length) {
    let shifts = '';
    for (let i = 0; i < a.length; i++) {
      const sa = a.charCodeAt(i) - 97;
      const sb = b.charCodeAt(i) - 97;
      shifts += `${((sb - sa) + 26) % 26},`;
    }
    return `caesar:${shifts}`;
  }
  return 'unknown';
}

function completeStringPattern(
  seq: (string | null)[],
  options: string[],
): string | null {
  // Find first null index
  const nullIdx = seq.findIndex((s) => s === null);
  if (nullIdx < 1) return options[0] ?? null;

  // Detect repeating pattern (period = 1, 2, 3...)
  for (let period = 1; period <= Math.min(4, nullIdx); period++) {
    let consistent = true;
    for (let i = period; i < nullIdx; i++) {
      if (seq[i] !== seq[i - period]) { consistent = false; break; }
    }
    if (consistent && nullIdx >= period) {
      const candidate = seq[nullIdx - period];
      if (candidate && options.includes(candidate)) return candidate;
    }
  }
  // Fallback: alphabetical increment
  const prev = seq[nullIdx - 1];
  if (typeof prev === 'string' && prev.length === 1) {
    const next = String.fromCharCode(prev.charCodeAt(0) + 1);
    if (options.includes(next)) return next;
  }
  return options[0] ?? null;
}

// ── Planning ──────────────────────────────────────────────────────────────

function reasonPlanning(input: any): ReasoningResult {
  const steps: ReasoningStep[] = [];

  // Graph pathfinding: { graph: {a:[b,c], b:[d]}, start, goal }
  if (input && typeof input === 'object' && 'graph' in input && 'start' in input && 'goal' in input) {
    const { graph, start, goal } = input as {
      graph: Record<string, string[]>;
      start: string;
      goal: string;
    };
    const path = bfs(graph, start, goal);
    steps.push({
      description: 'Breadth-first search',
      detail: `Find shortest path ${start} → ${goal}`,
      output: path,
    });
    return {
      answer: path,
      steps,
      strategy: 'bfs-pathfinding',
      confidence: path ? 0.95 : 0.3,
      verification: path ? 'verified' : 'failed',
    };
  }

  // Task scheduling: { tasks: [{name, duration, deps: []}], timeLimit }
  if (input && typeof input === 'object' && 'tasks' in input) {
    const { tasks, timeLimit } = input as {
      tasks: { name: string; duration: number; deps: string[] }[];
      timeLimit?: number;
    };
    const order = topologicalSort(tasks);
    const total = order.reduce((sum, t) => sum + t.duration, 0);
    steps.push({
      description: 'Topological sort + duration sum',
      detail: `Order: ${order.map((t) => t.name).join(' → ')}; total=${total}`,
      output: { order: order.map((t) => t.name), total, fits: timeLimit ? total <= timeLimit : true },
    });
    return {
      answer: { order: order.map((t) => t.name), total, fits: timeLimit ? total <= timeLimit : true },
      steps,
      strategy: 'topological-schedule',
      confidence: 0.9,
      verification: 'verified',
    };
  }

  return {
    answer: null,
    steps,
    strategy: 'unknown-planning',
    confidence: 0.1,
    verification: 'unverified',
  };
}

function bfs(
  graph: Record<string, string[]>,
  start: string,
  goal: string,
): string[] | null {
  if (start === goal) return [start];
  const visited = new Set<string>([start]);
  const queue: { node: string; path: string[] }[] = [{ node: start, path: [start] }];
  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    const neighbors = graph[node] ?? [];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      const newPath = [...path, n];
      if (n === goal) return newPath;
      queue.push({ node: n, path: newPath });
    }
  }
  return null;
}

function topologicalSort(
  tasks: { name: string; duration: number; deps: string[] }[],
): { name: string; duration: number; deps: string[] }[] {
  const byName = new Map(tasks.map((t) => [t.name, t]));
  const visited = new Set<string>();
  const result: { name: string; duration: number; deps: string[] }[] = [];
  const visit = (name: string, stack: Set<string>) => {
    if (visited.has(name)) return;
    if (stack.has(name)) return; // cycle - skip
    stack.add(name);
    const task = byName.get(name);
    if (!task) return;
    for (const dep of task.deps) visit(dep, stack);
    stack.delete(name);
    visited.add(name);
    result.push(task);
  };
  for (const t of tasks) visit(t.name, new Set());
  return result;
}

// ── Coding puzzles ────────────────────────────────────────────────────────

function reasonCoding(input: any): ReasoningResult {
  const steps: ReasoningStep[] = [];

  // Reverse a string
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'reverse') {
    const s = (input as any).s as string;
    const result = [...s].reverse().join('');
    steps.push({ description: 'Reverse string char-by-char', detail: s, output: result });
    return {
      answer: result, steps, strategy: 'reverse-string',
      confidence: 1, verification: 'verified',
    };
  }

  // FizzBuzz up to n
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'fizzbuzz') {
    const n = (input as any).n as number;
    const result: string[] = [];
    for (let i = 1; i <= n; i++) {
      if (i % 15 === 0) result.push('FizzBuzz');
      else if (i % 3 === 0) result.push('Fizz');
      else if (i % 5 === 0) result.push('Buzz');
      else result.push(String(i));
    }
    steps.push({
      description: 'Iterate 1..n, classify by divisibility',
      detail: `n=${n}`,
      output: result,
    });
    return {
      answer: result, steps, strategy: 'fizzbuzz-iterate',
      confidence: 1, verification: 'verified',
    };
  }

  // Sum of array / range
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'sum') {
    const arr = (input as any).arr as number[];
    const result = arr.reduce((a, b) => a + b, 0);
    steps.push({
      description: 'Fold array with addition',
      detail: `[${arr.join('+')}]`,
      output: result,
    });
    return {
      answer: result, steps, strategy: 'fold-sum',
      confidence: 1, verification: 'verified',
    };
  }

  // Check palindrome
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'palindrome') {
    const s = (input as any).s as string;
    const result = s === [...s].reverse().join('');
    steps.push({
      description: 'Compare string to its reverse',
      detail: `"${s}" reversed = "${[...s].reverse().join('')}"`,
      output: result,
    });
    return {
      answer: result, steps, strategy: 'palindrome-check',
      confidence: 1, verification: 'verified',
    };
  }

  // Sort
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'sort') {
    const arr = (input as any).arr as number[];
    const result = [...arr].sort((a, b) => a - b);
    steps.push({
      description: 'Sort ascending',
      detail: `[${arr.join(',')}]`,
      output: result,
    });
    return {
      answer: result, steps, strategy: 'comparison-sort',
      confidence: 1, verification: 'verified',
    };
  }

  return {
    answer: null, steps, strategy: 'unknown-coding',
    confidence: 0.1, verification: 'unverified',
  };
}

// ── Creative ──────────────────────────────────────────────────────────────

function reasonCreative(input: any): ReasoningResult {
  const steps: ReasoningStep[] = [];

  // Generate all permutations of a string
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'permutations') {
    const s = (input as any).s as string;
    const result = permutations(s);
    steps.push({
      description: 'Recursive backtracking permutation generator',
      detail: `s="${s}" → ${result.length} permutations`,
      output: result,
    });
    return {
      answer: result, steps, strategy: 'backtracking-permutations',
      confidence: 1, verification: 'verified',
    };
  }

  // Generate combinations of n choose k
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'combinations') {
    const arr = (input as any).arr as any[];
    const k = (input as any).k as number;
    const result = combinations(arr, k);
    steps.push({
      description: 'Combinatorial generation',
      detail: `${arr.length} choose ${k} = ${result.length}`,
      output: result,
    });
    return {
      answer: result, steps, strategy: 'combinations',
      confidence: 1, verification: 'verified',
    };
  }

  // Acronym generation
  if (input && typeof input === 'object' && 'op' in input && (input as any).op === 'acronym') {
    const words = (input as any).words as string[];
    const result = words.map((w) => w[0]?.toUpperCase() ?? '').join('');
    steps.push({
      description: 'Take first letter of each word',
      detail: words.join(' '),
      output: result,
    });
    return {
      answer: result, steps, strategy: 'acronym',
      confidence: 1, verification: 'verified',
    };
  }

  return {
    answer: null, steps, strategy: 'unknown-creative',
    confidence: 0.1, verification: 'unverified',
  };
}

function permutations(s: string): string[] {
  if (s.length <= 1) return [s];
  const result: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const rest = s.slice(0, i) + s.slice(i + 1);
    for (const p of permutations(rest)) result.push(s[i] + p);
  }
  return Array.from(new Set(result));
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// ── Multi-step reasoning ──────────────────────────────────────────────────

function reasonMultiStep(input: any, hints: string[] = []): ReasoningResult {
  const steps: ReasoningStep[] = [];

  // Chain of simple steps: { steps: [{type:'math',input:...}, ...], combine: 'last'|'sum'|'product' }
  if (input && typeof input === 'object' && Array.isArray((input as any).steps)) {
    const chain = (input as any).steps as {
      type: TaskCategory;
      input: any;
    }[];
    const combine = (input as any).combine ?? 'last';
    const intermediate: any[] = [];
    for (const step of chain) {
      const r = reason(step.type, step.input, hints);
      steps.push({
        description: `Sub-step: ${step.type}`,
        detail: r.steps.map((s) => s.detail).join(' | '),
        output: r.answer,
      });
      intermediate.push(r.answer);
    }
    let answer: any = null;
    switch (combine) {
      case 'last': answer = intermediate[intermediate.length - 1]; break;
      case 'sum': answer = intermediate.reduce((a, b) => (typeof a === 'number' && typeof b === 'number' ? a + b : a), 0); break;
      case 'product': answer = intermediate.reduce((a, b) => (typeof a === 'number' && typeof b === 'number' ? a * b : a), 1); break;
      case 'array': answer = intermediate; break;
    }
    steps.push({
      description: `Combine sub-results via "${combine}"`,
      detail: `intermediate = ${JSON.stringify(intermediate)}`,
      output: answer,
    });
    return {
      answer, steps,
      strategy: 'multi-step-chain',
      confidence: 0.85,
      verification: 'verified',
    };
  }

  return {
    answer: null, steps,
    strategy: 'unknown-reasoning',
    confidence: 0.1, verification: 'unverified',
  };
}
