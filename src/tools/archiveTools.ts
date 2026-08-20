export type ToolResult = { title: string; body: string; meta: string };

export function runArchiveTool(toolId: string, input: string): ToolResult {
  const value = input.trim();
  switch (toolId) {
    case 'memory': return { title: 'Memory Vault', body: `Captured locally: “${value || 'Untitled memory'}”`, meta: 'stored on device' };
    case 'reasoning': return { title: 'Reasoning Chain', body: `1. Define the desired outcome.\n2. Separate facts from assumptions.\n3. Choose the smallest useful next action.\n\nPrompt: ${value || 'No prompt supplied.'}`, meta: '3 steps generated' };
    case 'learning': return { title: 'Learning Loop', body: `Observation: ${value || 'No observation supplied.'}\n\nLesson: Keep the pattern that worked, name the constraint, and test the next version with one measurable signal.`, meta: 'reflection ready' };
    case 'calculator': return { title: 'Calculator', body: calculate(value), meta: 'deterministic result' };
    case 'summarize': return { title: 'Summarizer', body: summarize(value), meta: 'local compression' };
    case 'planner': return { title: 'Project Planner', body: `Outcome\n${value || 'Name the outcome'}\n\nMilestone 1 · Shape\nClarify scope, audience, and constraints.\n\nMilestone 2 · Build\nCreate the smallest complete version.\n\nMilestone 3 · Learn\nReview feedback and decide the next iteration.`, meta: '3 milestones' };
    default: return { title: 'Nova Tool', body: 'Tool not found.', meta: 'offline' };
  }
}

function calculate(expression: string) {
  if (!expression) return 'Try an expression like 18 * 4.';
  if (!/^[0-9+\-*/().%\s]+$/.test(expression)) return 'Only numeric expressions are supported.';
  const tokens = expression.match(/\d+(?:\.\d+)?|[+\-*/()%]/g);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) return 'That expression could not be evaluated.';
  const values: number[] = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
  const apply = () => { const op = operators.pop(); const right = values.pop(); const left = values.pop(); if (op === undefined || left === undefined || right === undefined) throw new Error('invalid'); if (op === '+') values.push(left + right); else if (op === '-') values.push(left - right); else if (op === '*') values.push(left * right); else if (op === '/') { if (right === 0) throw new Error('zero'); values.push(left / right); } else values.push(left % right); };
  try {
    for (const token of tokens) {
      if (/^\d/.test(token)) values.push(Number(token));
      else if (token === '(') operators.push(token);
      else if (token === ')') { while (operators.at(-1) && operators.at(-1) !== '(') apply(); if (operators.pop() !== '(') throw new Error('invalid'); }
      else { while (operators.length > 0 && operators[operators.length - 1] !== '(' && precedence[operators[operators.length - 1]!] >= precedence[token]) apply(); operators.push(token); }
    }
    while (operators.length) { if (operators.at(-1) === '(') throw new Error('invalid'); apply(); }
    if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error('invalid');
    return `${expression} = ${values[0].toLocaleString()}`;
  } catch { return 'That expression could not be evaluated.'; }
}

function summarize(input: string) { if (!input) return 'Paste notes to create a brief.'; const sentences = input.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean); return sentences.slice(0, 3).join(' ') + (sentences.length > 3 ? '…' : ''); }
