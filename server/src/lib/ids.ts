export function newId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint8Array(8))
  const hex = Array.from(rand).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${Date.now().toString(36)}${hex}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
