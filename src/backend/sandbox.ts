export type SandboxCommand = { op: 'echo' | 'uppercase' | 'summarize'; input: string };
export type SandboxRun = { id: string; status: 'completed' | 'rejected'; output: string; violations: string[]; executedAt: string };

const limits = { maxInputLength: 4_000, blockedPatterns: [/\b(delete|drop|truncate|shutdown|curl|fetch|http):?\b/i, /[;&|`$<>]/] };
const id = () => `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function inspectSandboxCommand(command: SandboxCommand) {
  const violations: string[] = [];
  if (!['echo', 'uppercase', 'summarize'].includes(command.op)) violations.push('Unsupported sandbox operation.');
  if (command.input.length > limits.maxInputLength) violations.push(`Input exceeds ${limits.maxInputLength} characters.`);
  if (limits.blockedPatterns.some((pattern) => pattern.test(command.input))) violations.push('Input contains blocked command or shell metacharacter patterns.');
  return violations;
}

export async function runSandboxCommand(command: SandboxCommand): Promise<SandboxRun> {
  const violations = inspectSandboxCommand(command);
  if (violations.length) return { id: id(), status: 'rejected', output: '', violations, executedAt: new Date().toISOString() };
  const normalized = command.input.trim();
  const output = command.op === 'uppercase' ? normalized.toUpperCase() : command.op === 'summarize' ? normalized.split(/\s+/).slice(0, 40).join(' ') : normalized;
  return { id: id(), status: 'completed', output, violations, executedAt: new Date().toISOString() };
}
