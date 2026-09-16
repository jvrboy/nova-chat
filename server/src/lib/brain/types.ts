/**
 * Brain types — shared across all cognitive modules.
 * Pure TypeScript, no external deps.
 */

export type CognitionType =
  | 'observe'
  | 'reason'
  | 'plan'
  | 'act'
  | 'reflect'
  | 'learn';

export interface Cognition {
  id?: string;
  cycle: number;
  type: CognitionType;
  input: unknown;
  output: unknown;
  confidence: number;
  reasoning: string;
  taskId?: string;
  createdAt?: Date;
}

export type MemoryKind =
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'working';

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  accessCount: number;
  lastAccess: Date;
  source: string | null;
  tags: string | null;
  relatedIds: string | null;
  createdAt: Date;
}

export type TaskCategory =
  | 'logic'
  | 'math'
  | 'language'
  | 'planning'
  | 'creative'
  | 'coding'
  | 'reasoning';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  difficulty: number;
  input: unknown;
  expected: unknown;
  status: TaskStatus;
  attempt: number;
  maxAttempts: number;
  actual: unknown;
  score: number | null;
  mistakes: string[];
  lessons: string[];
  strategy: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface SkillRecord {
  id: string;
  name: string;
  category: TaskCategory | 'meta';
  description: string;
  pattern: {
    trigger: string;
    approach: string;
    steps: string[];
  };
  successRate: number;
  uses: number;
  successes: number;
  failures: number;
  mastery: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reflection {
  id?: string;
  trigger: 'post_task' | 'periodic' | 'mistake' | 'milestone';
  scope: 'task' | 'session' | 'capability' | 'global';
  findings: string[];
  weaknesses: string[];
  improvements: string[];
  applied: boolean;
  createdAt?: Date;
}

export interface CapabilityMap {
  logic: number;
  math: number;
  language: number;
  planning: number;
  creative: number;
  coding: number;
  reasoning: number;
  self_awareness: number;
  learning_rate: number;
  adaptability: number;
}

export interface BrainSnapshot {
  cycle: number;
  status: 'idle' | 'thinking' | 'working' | 'reflecting' | 'learning' | 'sleeping';
  currentTaskId: string | null;
  capabilities: CapabilityMap;
  memoryCount: number;
  skillCount: number;
  totalTasks: number;
  successRate: number;
  uptime: number; // ms since boot
}

export interface SolveResult {
  taskId: string;
  success: boolean;
  score: number;
  output: unknown;
  reasoning: string;
  strategy: string;
  mistakes: string[];
  lessons: string[];
  cyclesUsed: number;
  durationMs: number;
}
