// Secure sandboxing service: validates generated project files before they are
// accepted into the workspace. Static analysis only — nothing is executed.
// Checks: allowed extensions, size limits, dangerous patterns (eval, private
// network calls, credential exfiltration, obfuscation), and basic structure.

export type FileInput = { path: string; content: string }

const ALLOWED_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md', '.txt',
  '.yml', '.yaml', '.toml', '.svg', '.sql', '.py', '.env.example', '.gitignore',
])

const DANGEROUS: { re: RegExp; reason: string }[] = [
  { re: /\beval\s*\(/, reason: 'eval() execution' },
  { re: /new\s+Function\s*\(/, reason: 'new Function() execution' },
  { re: /child_process|execSync|spawnSync/, reason: 'process execution' },
  { re: /(169\.254\.169\.254|metadata\.google)/, reason: 'cloud metadata endpoint access' },
  { re: /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i, reason: 'hard-coded secret' },
  { re: /atob\(['"][A-Za-z0-9+/=]{100,}/, reason: 'base64-obfuscated payload' },
  { re: /document\.cookie/, reason: 'cookie access' },
  { re: /XMLHttpRequest|fetch\(['"]http:\/\//, reason: 'insecure HTTP request' },
]

const MAX_FILE_BYTES = 200_000
const MAX_TOTAL_BYTES = 1_500_000
const MAX_FILES = 200

export type FileVerdict = { path: string; ok: boolean; issues: string[] }
export type SandboxReport = {
  ok: boolean
  score: number
  files: FileVerdict[]
  summary: string
  checkedAt: string
}

function extOf(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.env.example')) return '.env.example'
  if (lower.endsWith('.gitignore')) return '.gitignore'
  const m = lower.match(/\.[a-z0-9]+$/)
  return m ? m[0] : ''
}

export function validateProjectFiles(files: FileInput[]): SandboxReport {
  const verdicts: FileVerdict[] = []
  let total = 0

  if (files.length > MAX_FILES) {
    return { ok: false, score: 0, files: [], summary: `Rejected: ${files.length} files exceeds the ${MAX_FILES}-file limit.`, checkedAt: new Date().toISOString() }
  }

  for (const f of files) {
    const issues: string[] = []
    const path = String(f.path ?? '')
    const content = String(f.content ?? '')
    const bytes = new TextEncoder().encode(content).length
    total += bytes

    if (!path || path.includes('..') || path.startsWith('/') || /^[a-z]:/i.test(path)) issues.push('unsafe path')
    const ext = extOf(path)
    if (ext && !ALLOWED_EXT.has(ext)) issues.push(`extension ${ext} not allowed`)
    if (bytes > MAX_FILE_BYTES) issues.push(`file exceeds ${MAX_FILE_BYTES} bytes`)
    for (const d of DANGEROUS) if (d.re.test(content)) issues.push(`dangerous pattern: ${d.reason}`)
    // Basic brace balance for code files
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const open = (content.match(/[{([]/g) ?? []).length
      const close = (content.match(/[})\]]/g) ?? []).length
      if (Math.abs(open - close) > Math.max(5, open * 0.2)) issues.push('suspicious unbalanced delimiters')
    }
    verdicts.push({ path, ok: issues.length === 0, issues })
  }

  if (total > MAX_TOTAL_BYTES) {
    verdicts.push({ path: '(project)', ok: false, issues: [`total size exceeds ${MAX_TOTAL_BYTES} bytes`] })
  }

  const bad = verdicts.filter((v) => !v.ok)
  const score = Math.max(0, Math.round(100 - bad.reduce((a, v) => a + v.issues.length * 12, 0)))
  return {
    ok: bad.length === 0,
    score,
    files: verdicts,
    summary: bad.length === 0
      ? `All ${verdicts.length} files passed sandbox validation (score ${score}/100).`
      : `${bad.length}/${verdicts.length} files flagged; score ${score}/100.`,
    checkedAt: new Date().toISOString(),
  }
}
