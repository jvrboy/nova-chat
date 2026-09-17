import { describe, expect, it } from 'vitest'
import { getTool, toolRegistry } from '../src/lib/tools'
import { pickStrategy, type StrategyId } from '../src/lib/reasoning'
import { validateProjectFiles, type FileInput } from '../src/lib/sandbox'

const runTool = async (id: string, input: Record<string, unknown>) => {
  const tool = getTool(id)
  if (!tool) throw new Error(`missing tool ${id}`)
  return tool.run(input, { env: {} as never, workspaceId: 'test', actorId: 'test' })
}

describe('advanced reasoning tools registry', () => {
  it('exposes all 13 new advanced tools', () => {
    const ids = toolRegistry.map((t) => t.id)
    const expected = [
      'reason-react', 'tree-of-thought', 'plan-execute', 'self-critique', 'multi-debate',
      'long-task-start', 'long-task-status', 'long-task-list',
      'code-review', 'prompt-optimize', 'synthesize-research', 'strategy-recommend', 'chain-tools',
    ]
    for (const id of expected) {
      expect(ids).toContain(id)
    }
  })

  it('still exposes all the original utility tools (no regressions)', () => {
    const ids = toolRegistry.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicates
    for (const id of ['base64-codec', 'url-codec', 'jwt-decode', 'timestamp-convert', 'word-count', 'calculator']) {
      expect(ids).toContain(id)
    }
  })

  it('strategy-recommend returns a valid strategy for any query', async () => {
    const result: any = await runTool('strategy-recommend', { query: 'Compare React vs Vue for a new dashboard project' })
    expect(result.recommendedStrategy).toBeTruthy()
    expect(result.reason).toBeTruthy()
    expect(Array.isArray(result.availableStrategies)).toBe(true)
    expect(result.availableStrategies.length).toBeGreaterThan(5)
  })

  it('chain-tools pipes the output of one tool into the next via `prev`', async () => {
    const result: any = await runTool('chain-tools', {
      steps: [
        { tool: 'uuid-generate', input: {} },
        { tool: 'hash', input: { algorithm: 'sha256' } }, // will receive prev = the UUID output
      ],
    })
    expect(result.steps).toBe(2)
    expect(result.results[0].ok).toBe(true)
    expect(result.results[1].ok).toBe(true)
    expect(result.finalOutput).toBeTruthy()
  })

  it('chain-tools refuses to run non-safe tools', async () => {
    const result: any = await runTool('chain-tools', {
      steps: [
        { tool: 'code-execute', input: { language: 'python', code: 'print(1)' } },
      ],
    })
    expect(result.steps).toBe(1)
    expect(result.results[0].ok).toBe(false)
    expect(result.results[0].error).toMatch(/cannot be chained|safe/)
  })
})

describe('strategy router heuristics', () => {
  const cases: Array<{ query: string; expected: StrategyId | StrategyId[] }> = [
    { query: 'What is 2+2?', expected: 'direct' },
    { query: 'Research the latest advances in fusion energy', expected: 'react' },
    { query: 'Compare React vs Vue: which is better for a SaaS dashboard, considering performance, ecosystem, and learning curve?', expected: 'multi_debate' },
    { query: 'Build me a customer onboarding flow: research best practices, design the screens, write the emails, and create a launch checklist. First research then design then write.', expected: 'plan_execute' },
    { query: 'Write a compelling pitch deck intro for a B2B AI startup', expected: 'self_critique' },
    { query: 'Prove that the sum of two even numbers is even, using mathematical induction', expected: 'tree_of_thought' },
  ]

  for (const c of cases) {
    it(`picks the right strategy for: "${c.query.slice(0, 60)}..."`, () => {
      const choice = pickStrategy(c.query)
      const expected = Array.isArray(c.expected) ? c.expected : [c.expected]
      expect(expected).toContain(choice.strategy)
    })
  }

  it('always returns a reason string', () => {
    for (const q of ['hello', 'what time is it', 'research quantum computing', '']) {
      const choice = pickStrategy(q || 'unknown')
      expect(typeof choice.reason).toBe('string')
      expect(choice.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('sandbox still validates correctly', () => {
  it('accepts clean files', () => {
    const files: FileInput[] = [
      { path: 'src/index.ts', content: 'export const add = (a: number, b: number) => a + b;' },
      { path: 'README.md', content: '# Hello world' },
    ]
    const report = validateProjectFiles(files)
    expect(report.ok).toBe(true)
    expect(report.score).toBeGreaterThan(80)
  })

  it('rejects dangerous patterns', () => {
    const files: FileInput[] = [
      { path: 'evil.ts', content: 'const x = eval("1+1")' },
    ]
    const report = validateProjectFiles(files)
    expect(report.ok).toBe(false)
  })
})
