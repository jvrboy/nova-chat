// Font system for Nova web. Each font maps to a Google Font (loaded on demand)
// and a generic fallback. Applied to the four semantic slots: sans (UI), serif
// (assistant prose), display (headlines), and mono (code).

export type FontChoice = { id: string; label: string; stack: string; google?: string }

export const FONT_SLOTS = ['sans', 'serif', 'display', 'mono'] as const
export type FontSlot = (typeof FONT_SLOTS)[number]

export const FONTS: Record<FontSlot, FontChoice[]> = {
  sans: [
    { id: 'dm-sans', label: 'DM Sans', stack: '"DM Sans",sans-serif', google: 'DM+Sans:wght@400;500;700' },
    { id: 'inter', label: 'Inter', stack: '"Inter",sans-serif', google: 'Inter:wght@400;500;700' },
    { id: 'space-grotesk', label: 'Space Grotesk', stack: '"Space Grotesk",sans-serif', google: 'Space+Grotesk:wght@400;500;700' },
    { id: 'work-sans', label: 'Work Sans', stack: '"Work Sans",sans-serif', google: 'Work+Sans:wght@400;500;700' },
    { id: 'schibsted', label: 'Schibsted Grotesk', stack: '"Schibsted Grotesk",sans-serif', google: 'Schibsted+Grotesk:wght@400;500;700' },
    { id: 'varela', label: 'Varela Round', stack: '"Varela Round",sans-serif', google: 'Varela+Round' },
    { id: 'yantramanav', label: 'Yantramanav', stack: '"Yantramanav",sans-serif', google: 'Yantramanav:wght@400;500;700' },
    { id: 'chakra', label: 'Chakra Petch', stack: '"Chakra Petch",sans-serif', google: 'Chakra+Petch:wght@400;500;700' },
    { id: 'trebuchet', label: 'Trebuchet MS', stack: '"Trebuchet MS",sans-serif' },
    { id: 'century', label: 'Century Gothic', stack: '"Century Gothic","Futura",sans-serif' },
  ],
  serif: [
    { id: 'newsreader', label: 'Newsreader', stack: '"Newsreader",serif', google: 'Newsreader:ital,wght@0,400;0,500;1,400' },
    { id: 'source-serif', label: 'Source Serif 4', stack: '"Source Serif 4",serif', google: 'Source+Serif+4:ital,wght@0,400;0,600;1,400' },
    { id: 'lora', label: 'Lora', stack: '"Lora",serif', google: 'Lora:ital,wght@0,400;0,600;1,400' },
    { id: 'zilla', label: 'Zilla Slab', stack: '"Zilla Slab",serif', google: 'Zilla+Slab:wght@400;600' },
    { id: 'roboto-slab', label: 'Roboto Slab', stack: '"Roboto Slab",serif', google: 'Roboto+Slab:wght@400;600' },
    { id: 'times', label: 'Times New Roman', stack: '"Times New Roman",serif' },
  ],
  display: [
    { id: 'playfair', label: 'Playfair Display', stack: '"Playfair Display",serif', google: 'Playfair+Display:wght@500;600;700' },
    { id: 'crimson', label: 'Crimson Pro', stack: '"Crimson Pro",serif', google: 'Crimson+Pro:wght@500;600;700' },
    { id: 'bebas', label: 'Bebas Neue', stack: '"Bebas Neue",sans-serif', google: 'Bebas+Neue' },
    { id: 'yanone', label: 'Yanone Kaffeesatz', stack: '"Yanone Kaffeesatz",sans-serif', google: 'Yanone+Kaffeesatz:wght@500;600;700' },
    { id: 'wix', label: 'Wix Madefor Display', stack: '"Wix Madefor Display",sans-serif', google: 'Wix+Madefor+Display:wght@500;600;700' },
    { id: 'titillium', label: 'Titillium Web', stack: '"Titillium Web",sans-serif', google: 'Titillium+Web:wght@500;600;700' },
  ],
  mono: [
    { id: 'jetbrains', label: 'JetBrains Mono', stack: '"JetBrains Mono",monospace', google: 'JetBrains+Mono:wght@400;500' },
    { id: 'fira', label: 'Fira Code', stack: '"Fira Code",monospace', google: 'Fira+Code:wght@400;500' },
    { id: 'space-mono', label: 'Space Mono', stack: '"Space Mono",monospace', google: 'Space+Mono:wght@400;700' },
    { id: 'courier', label: 'Courier New', stack: '"Courier New",monospace' },
  ],
}

export const DEFAULT_FONTS: Record<FontSlot, string> = {
  sans: 'dm-sans',
  serif: 'newsreader',
  display: 'playfair',
  mono: 'jetbrains',
}

const loaded = new Set<string>()

function ensureFont(f: FontChoice) {
  if (!f.google || loaded.has(f.id)) return
  loaded.add(f.id)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`
  document.head.appendChild(link)
}

function findFont(slot: FontSlot, id: string): FontChoice {
  return FONTS[slot].find((f) => f.id === id) ?? FONTS[slot][0]
}

export function applyFonts(sel: Record<FontSlot, string>) {
  const root = document.documentElement
  for (const slot of FONT_SLOTS) {
    const f = findFont(slot, sel[slot])
    ensureFont(f)
    root.style.setProperty(`--font-${slot}`, f.stack)
  }
}

export function loadFontSettings(): Record<FontSlot, string> {
  try {
    const raw = localStorage.getItem('nova.fonts')
    if (raw) return { ...DEFAULT_FONTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_FONTS }
}

export function saveFontSettings(sel: Record<FontSlot, string>) {
  localStorage.setItem('nova.fonts', JSON.stringify(sel))
  applyFonts(sel)
}
