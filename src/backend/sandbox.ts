export type SandboxOperation = 'echo' | 'uppercase' | 'summarize' | 'redact' | 'word-count' | 'risk-score';
export type SandboxCommand = { op: SandboxOperation; input: string };
export type SandboxRun = { id: string; status: 'completed' | 'rejected'; output: string; violations: string[]; executedAt: string };

const operations: SandboxOperation[] = ['echo', 'uppercase', 'summarize', 'redact', 'word-count', 'risk-score'];
const limits = { maxInputLength: 4_000, blockedPatterns: [/\b(delete|drop|truncate|shutdown|curl|fetch)\b/i, /https?:\/\//i, /[;&|`$<>]/] };
const id = () => `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function inspectSandboxCommand(command: SandboxCommand) {
  const violations: string[] = [];
  if (!operations.includes(command.op)) violations.push('Unsupported sandbox operation.');
  if (command.input.length > limits.maxInputLength) violations.push(`Input exceeds ${limits.maxInputLength} characters.`);
  if (limits.blockedPatterns.some((pattern) => pattern.test(command.input))) violations.push('Input contains blocked command or shell metacharacter patterns.');
  return violations;
}

export async function runSandboxCommand(command: SandboxCommand): Promise<SandboxRun> {
  const violations = inspectSandboxCommand(command);
  if (violations.length) return { id: id(), status: 'rejected', output: '', violations, executedAt: new Date().toISOString() };
  const normalized = command.input.trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const output = command.op === 'uppercase'
    ? normalized.toUpperCase()
    : command.op === 'summarize'
      ? words.slice(0, 40).join(' ')
      : command.op === 'redact'
        ? normalized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]').replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[redacted-id]')
        : command.op === 'word-count'
          ? JSON.stringify({ words: words.length, characters: normalized.length }, null, 2)
          : command.op === 'risk-score'
            ? JSON.stringify({ score: Math.min(100, words.filter((word) => /secret|token|password|credential|urgent|blocked/i.test(word)).length * 20), signals: words.filter((word) => /secret|token|password|credential|urgent|blocked/i.test(word)).slice(0, 10) }, null, 2)
            : normalized;
  return { id: id(), status: 'completed', output, violations, executedAt: new Date().toISOString() };
}
