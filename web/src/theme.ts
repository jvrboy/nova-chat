// Nova web theme engine — 26 presets (12 editorial originals + 14 new pro themes).
export type ThemePreset = {
  id: string
  label: string
  background: string
  foreground: string
  paper: string
  paperDeep: string
  inkSoft: string
  inkFaint: string
  line: string
  lineStrong: string
  accent: string
  accentDark: string
  accentWash: string
  accentGreen: string
  accentBlue: string
  accentPurple: string
  accentGold: string
  dark?: boolean
}

function t(partial: Omit<ThemePreset, 'accentGreen' | 'accentBlue' | 'accentPurple' | 'accentGold'> & Partial<Pick<ThemePreset, 'accentGreen' | 'accentBlue' | 'accentPurple' | 'accentGold'>>): ThemePreset {
  return {
    accentGreen: '#3a8a5c',
    accentBlue: '#3a6ad8',
    accentPurple: '#7c3ad8',
    accentGold: '#d89a3a',
    ...partial,
  }
}

export const THEMES: ThemePreset[] = [
  // ---- Editorial originals ----
  t({ id: 'warm-paper', label: 'Warm Paper', background: '#f6f3ee', foreground: '#2c2b29', paper: '#fbfaf8', paperDeep: '#efebe4', inkSoft: '#6d6a64', inkFaint: '#9b978f', line: '#e6e1d9', lineStrong: '#d8d1c6', accent: '#d85a3a', accentDark: '#b8462c', accentWash: '#f6dfd7' }),
  t({ id: 'amethyst-night', label: 'Amethyst Night', dark: true, background: '#17131f', foreground: '#ece7f5', paper: '#1e1829', paperDeep: '#120e1a', inkSoft: '#a89fc0', inkFaint: '#6f6588', line: '#2c2438', lineStrong: '#3c3252', accent: '#b08bd8', accentDark: '#9668c4', accentWash: '#2c2140' }),
  t({ id: 'arctic-aurora', label: 'Arctic Aurora', background: '#eef3f5', foreground: '#233038', paper: '#f8fbfc', paperDeep: '#e2eaee', inkSoft: '#5d707a', inkFaint: '#93a4ad', line: '#d8e2e7', lineStrong: '#c3d2d9', accent: '#2f8f83', accentDark: '#22736a', accentWash: '#d5ece8' }),
  t({ id: 'sunset-studio', label: 'Sunset Studio', background: '#faf0e9', foreground: '#3a2a24', paper: '#fff8f4', paperDeep: '#f3e3d8', inkSoft: '#8a6c60', inkFaint: '#b59a8e', line: '#efdcd0', lineStrong: '#e2c6b4', accent: '#e0603a', accentDark: '#c04a28', accentWash: '#fadfd2' }),
  t({ id: 'zen-garden', label: 'Zen Garden', background: '#f0f2ec', foreground: '#2a2f28', paper: '#f8f9f5', paperDeep: '#e4e8dd', inkSoft: '#67705f', inkFaint: '#98a08e', line: '#dde2d2', lineStrong: '#c9d1ba', accent: '#5a7a4a', accentDark: '#476238', accentWash: '#dfe8d5' }),
  t({ id: 'sandstorm', label: 'Sandstorm', background: '#f2ead9', foreground: '#3d3226', paper: '#faf4e8', paperDeep: '#e8dcc4', inkSoft: '#857253', inkFaint: '#b3a184', line: '#e5d8bc', lineStrong: '#d5c3a0', accent: '#c07b2a', accentDark: '#a06320', accentWash: '#f2e0c4' }),
  t({ id: 'candy-bloom', label: 'Candy Bloom', background: '#fceef2', foreground: '#3d2430', paper: '#fff7fa', paperDeep: '#f6e0e8', inkSoft: '#94687c', inkFaint: '#c09aab', line: '#f2d6e0', lineStrong: '#e4bccd', accent: '#e04a80', accentDark: '#c23468', accentWash: '#fad9e4' }),
  t({ id: 'sapphire-circuit', label: 'Sapphire Circuit', dark: true, background: '#0e1420', foreground: '#dfe8f5', paper: '#141c2c', paperDeep: '#0a0f1a', inkSoft: '#8a9ab5', inkFaint: '#5a6a85', line: '#223050', lineStrong: '#304064', accent: '#4a8aff', accentDark: '#3a6fd8', accentWash: '#1a2a48' }),
  t({ id: 'terminal-matrix', label: 'Terminal Matrix', dark: true, background: '#0a0f0a', foreground: '#c8e8c8', paper: '#101810', paperDeep: '#060a06', inkSoft: '#6a8a6a', inkFaint: '#486048', line: '#1a2a1a', lineStrong: '#2a402a', accent: '#3ad85a', accentDark: '#2ab846', accentWash: '#123018', accentGreen: '#3ad85a' }),
  t({ id: 'vaporwave-grid', label: 'Vaporwave Grid', dark: true, background: '#180f28', foreground: '#f0e8ff', paper: '#201438', paperDeep: '#100a20', inkSoft: '#a08cc8', inkFaint: '#6f5a95', line: '#2e1f4a', lineStrong: '#402f66', accent: '#ff6ac8', accentDark: '#e04ab0', accentWash: '#3a1f50', accentBlue: '#6a8aff', accentPurple: '#b06aff' }),
  t({ id: 'blueprint-grid', label: 'Blueprint Grid', dark: true, background: '#16283f', foreground: '#e0ecf8', paper: '#1d3450', paperDeep: '#10203a', inkSoft: '#8fa8c8', inkFaint: '#5f7a9a', line: '#2a4468', lineStrong: '#3a5a85', accent: '#5ab8ff', accentDark: '#3a98e0', accentWash: '#1d3a58' }),
  t({ id: 'aurora-3d', label: 'Aurora 3D', dark: true, background: '#101826', foreground: '#e5f0f8', paper: '#182234', paperDeep: '#0b1220', inkSoft: '#8aa2b8', inkFaint: '#5c7186', line: '#263650', lineStrong: '#36486a', accent: '#4ac8c0', accentDark: '#34a8a0', accentWash: '#16323e' }),
  // ---- New pro themes ----
  t({ id: 'midnight-ink', label: 'Midnight Ink', dark: true, background: '#0d1117', foreground: '#e6edf3', paper: '#161b22', paperDeep: '#090c10', inkSoft: '#8b949e', inkFaint: '#57606a', line: '#21262d', lineStrong: '#30363d', accent: '#58a6ff', accentDark: '#1f6feb', accentWash: '#13233a' }),
  t({ id: 'forest-deep', label: 'Forest Deep', dark: true, background: '#0e1512', foreground: '#d9e8dd', paper: '#15201a', paperDeep: '#090f0c', inkSoft: '#7e9584', inkFaint: '#54685a', line: '#223028', lineStrong: '#31443a', accent: '#6fbf73', accentDark: '#4c9a51', accentWash: '#16301c' }),
  t({ id: 'rose-quartz', label: 'Rose Quartz', background: '#faf3f5', foreground: '#36262c', paper: '#fffafb', paperDeep: '#f2e4e8', inkSoft: '#8f6f78', inkFaint: '#bb9aa3', line: '#eddde2', lineStrong: '#dcc3cb', accent: '#c2587c', accentDark: '#a54265', accentWash: '#f6dfe7' }),
  t({ id: 'ocean-breeze', label: 'Ocean Breeze', background: '#eff6f8', foreground: '#1f3138', paper: '#f9fcfd', paperDeep: '#dfeaee', inkSoft: '#5b727b', inkFaint: '#8fa5ad', line: '#d4e3e8', lineStrong: '#bcd2da', accent: '#2a7fa8', accentDark: '#1f6485', accentWash: '#d6ebf2' }),
  t({ id: 'charcoal-pro', label: 'Charcoal Pro', dark: true, background: '#1b1b1d', foreground: '#ececee', paper: '#232326', paperDeep: '#131314', inkSoft: '#9a9aa0', inkFaint: '#66666c', line: '#2e2e33', lineStrong: '#3f3f46', accent: '#e8b44a', accentDark: '#c99734', accentWash: '#3a3018' }),
  t({ id: 'solar-flare', label: 'Solar Flare', background: '#fdf3e7', foreground: '#3a2a1a', paper: '#fffaf2', paperDeep: '#f5e5cf', inkSoft: '#8a715a', inkFaint: '#b59f8a', line: '#eeddc3', lineStrong: '#dfc5a3', accent: '#e07b24', accentDark: '#bf6115', accentWash: '#f9e3c9' }),
  t({ id: 'lavender-mist', label: 'Lavender Mist', background: '#f4f2fa', foreground: '#2c2838', paper: '#fbfaff', paperDeep: '#e8e4f2', inkSoft: '#716a8a', inkFaint: '#9e97b5', line: '#e0dbf0', lineStrong: '#c9c2e0', accent: '#7a68c8', accentDark: '#5f4dae', accentWash: '#e6e0f6' }),
  t({ id: 'copper-canyon', label: 'Copper Canyon', background: '#f7f0ea', foreground: '#372920', paper: '#fdf8f3', paperDeep: '#ece0d4', inkSoft: '#85705f', inkFaint: '#b09a88', line: '#e4d5c6', lineStrong: '#d1bca8', accent: '#b05c34', accentDark: '#92471f', accentWash: '#f2ddd0' }),
  t({ id: 'nordic-frost', label: 'Nordic Frost', background: '#f2f5f7', foreground: '#28323a', paper: '#fafcfd', paperDeep: '#e3eaee', inkSoft: '#647682', inkFaint: '#94a5af', line: '#d8e2e8', lineStrong: '#c0cfd8', accent: '#4a90b8', accentDark: '#35729a', accentWash: '#dceaf2' }),
  t({ id: 'emerald-city', label: 'Emerald City', dark: true, background: '#0c1614', foreground: '#d5ece4', paper: '#132420', paperDeep: '#08100e', inkSoft: '#7a9a8e', inkFaint: '#516a60', line: '#1e332c', lineStrong: '#2c483e', accent: '#34c48c', accentDark: '#22a06e', accentWash: '#123528' }),
  t({ id: 'crimson-tide', label: 'Crimson Tide', dark: true, background: '#180e10', foreground: '#f2e3e5', paper: '#221316', paperDeep: '#10090a', inkSoft: '#a58388', inkFaint: '#705558', line: '#33191d', lineStrong: '#4a2429', accent: '#e05a6a', accentDark: '#c03a4c', accentWash: '#3d181e' }),
  t({ id: 'golden-hour', label: 'Golden Hour', background: '#faf5ea', foreground: '#332d1e', paper: '#fffdf6', paperDeep: '#f0e8d3', inkSoft: '#7d7358', inkFaint: '#aba184', line: '#e7ddc2', lineStrong: '#d5c7a2', accent: '#c8962e', accentDark: '#a67a1c', accentWash: '#f4e8c8' }),
  t({ id: 'slate-minimal', label: 'Slate Minimal', background: '#f4f5f6', foreground: '#282b2e', paper: '#fcfcfd', paperDeep: '#e8eaec', inkSoft: '#676d73', inkFaint: '#979da3', line: '#dee1e4', lineStrong: '#c6ccd1', accent: '#4a5568', accentDark: '#36404e', accentWash: '#e2e6ea' }),
  t({ id: 'neon-tokyo', label: 'Neo Tokyo', dark: true, background: '#0f0a1e', foreground: '#efe8ff', paper: '#181030', paperDeep: '#090614', inkSoft: '#9c8cc4', inkFaint: '#685a8c', line: '#281b48', lineStrong: '#3a2866', accent: '#00e5c8', accentDark: '#00bfa5', accentWash: '#0f3a34', accentPurple: '#b46aff', accentBlue: '#4a9aff' }),
  // ---- New themes (batch 2) ----
  t({ id: 'paper-white', label: 'Paper White', background: '#ffffff', foreground: '#1c1c1e', paper: '#fafafa', paperDeep: '#f0f0f0', inkSoft: '#5c5c60', inkFaint: '#9a9aa0', line: '#e8e8ea', lineStrong: '#d3d3d8', accent: '#0a84ff', accentDark: '#0066d6', accentWash: '#e0eeff' }),
  t({ id: 'graphite', label: 'Graphite', dark: true, background: '#121316', foreground: '#e4e6ea', paper: '#1a1c20', paperDeep: '#0c0d10', inkSoft: '#8b9096', inkFaint: '#5c6167', line: '#24272c', lineStrong: '#34383e', accent: '#7ea8ff', accentDark: '#5b84e8', accentWash: '#1c2a48' }),
  t({ id: 'moss', label: 'Moss', background: '#eef1ea', foreground: '#27301f', paper: '#f7f9f4', paperDeep: '#e1e7d6', inkSoft: '#66745a', inkFaint: '#94a086', line: '#d8e0cc', lineStrong: '#c3cfae', accent: '#4c7c3c', accentDark: '#3a632e', accentWash: '#dfead2' }),
  t({ id: 'terracotta-clay', label: 'Terracotta Clay', background: '#f6ede7', foreground: '#3a2822', paper: '#fdf7f2', paperDeep: '#ecddd2', inkSoft: '#8a6a5c', inkFaint: '#b5978a', line: '#e8d5c8', lineStrong: '#d6bcab', accent: '#c0552e', accentDark: '#a0421f', accentWash: '#f5ddcf' }),
  t({ id: 'deep-sea', label: 'Deep Sea', dark: true, background: '#081420', foreground: '#d6e8f2', paper: '#0e1e2e', paperDeep: '#050d16', inkSoft: '#6f92a6', inkFaint: '#47647a', line: '#18303f', lineStrong: '#24455a', accent: '#38b6d8', accentDark: '#2292b0', accentWash: '#0f3040' }),
  t({ id: 'plum-velvet', label: 'Plum Velvet', dark: true, background: '#1a1018', foreground: '#efe0ea', paper: '#241722', paperDeep: '#120a10', inkSoft: '#a38197', inkFaint: '#6f5466', line: '#33202f', lineStrong: '#492e44', accent: '#d87ab0', accentDark: '#b85690', accentWash: '#3c1c30' }),
  t({ id: 'honeydew', label: 'Honeydew', background: '#f4f6ec', foreground: '#2c3018', paper: '#fbfcf5', paperDeep: '#e6ead2', inkSoft: '#6e744e', inkFaint: '#9ca27e', line: '#dde2c4', lineStrong: '#c9d0a6', accent: '#8a9a2e', accentDark: '#6e7c1c', accentWash: '#e9eecb' }),
  t({ id: 'steel-blue', label: 'Steel Blue', background: '#eef1f5', foreground: '#232c36', paper: '#f9fbfd', paperDeep: '#dfe5ec', inkSoft: '#5d6d7c', inkFaint: '#8f9dab', line: '#d5dde5', lineStrong: '#bcc8d4', accent: '#3c6e9c', accentDark: '#2a5578', accentWash: '#dbe6ef' }),
  t({ id: 'espresso', label: 'Espresso', dark: true, background: '#161210', foreground: '#ece2d8', paper: '#201a16', paperDeep: '#0e0b09', inkSoft: '#9a887a', inkFaint: '#685a4e', line: '#2c241e', lineStrong: '#40342a', accent: '#d89a5a', accentDark: '#b87a3e', accentWash: '#38271a' }),
  t({ id: 'blush-rose', label: 'Blush Rose', background: '#fbf1f0', foreground: '#3a2624', paper: '#fff9f8', paperDeep: '#f3e2e0', inkSoft: '#92716e', inkFaint: '#bd9e9b', line: '#ecdad8', lineStrong: '#dcc2bf', accent: '#cf5a52', accentDark: '#b04238', accentWash: '#f7dfdc' }),
  t({ id: 'slate-dark', label: 'Slate Dark', dark: true, background: '#14181d', foreground: '#dde4ea', paper: '#1c2128', paperDeep: '#0d1014', inkSoft: '#8592a0', inkFaint: '#5a6673', line: '#262d36', lineStrong: '#364050', accent: '#5aa8d8', accentDark: '#3e88b8', accentWash: '#1a2c3c' }),
  t({ id: 'mint-fresh', label: 'Mint Fresh', background: '#edf6f2', foreground: '#1f322a', paper: '#f8fcfa', paperDeep: '#ddebe4', inkSoft: '#5c7a6c', inkFaint: '#8fa99b', line: '#d2e4da', lineStrong: '#b6d2c4', accent: '#2e9a6c', accentDark: '#1f7a52', accentWash: '#d6ecdf' }),
  t({ id: 'royal-purple', label: 'Royal Purple', dark: true, background: '#140f1e', foreground: '#e6def5', paper: '#1d1629', paperDeep: '#0d0916', inkSoft: '#9485b5', inkFaint: '#63557e', line: '#2a2140', lineStrong: '#3d3158', accent: '#9668e8', accentDark: '#7a4ac8', accentWash: '#2a1c48' }),
  t({ id: 'amber-glow', label: 'Amber Glow', background: '#faf3e6', foreground: '#352a18', paper: '#fffaf0', paperDeep: '#f0e5cd', inkSoft: '#83715a', inkFaint: '#ac9a80', line: '#e7d9bd', lineStrong: '#d3c09c', accent: '#d88a1e', accentDark: '#b56e0e', accentWash: '#f6e4c2' }),
  t({ id: 'cobalt-night', label: 'Cobalt Night', dark: true, background: '#0a1020', foreground: '#dfe6f8', paper: '#111a30', paperDeep: '#060a16', inkSoft: '#7e8cb0', inkFaint: '#525f80', line: '#1c2745', lineStrong: '#2a3a5e', accent: '#5a7aff', accentDark: '#3e5ae0', accentWash: '#18224a' }),
  t({ id: 'olive-grove', label: 'Olive Grove', background: '#f0f1e8', foreground: '#2e3020', paper: '#f8f9f2', paperDeep: '#e2e4d0', inkSoft: '#6f7252', inkFaint: '#9b9e7e', line: '#dcdec4', lineStrong: '#c5c8a4', accent: '#6a7232', accentDark: '#525a20', accentWash: '#e3e6ca' }),
  t({ id: 'wine-cellar', label: 'Wine Cellar', dark: true, background: '#170f12', foreground: '#eedde0', paper: '#221419', paperDeep: '#0f090b', inkSoft: '#a28187', inkFaint: '#6d555a', line: '#311b21', lineStrong: '#472730', accent: '#c85a70', accentDark: '#a63e54', accentWash: '#381820' }),
  t({ id: 'cloud-grey', label: 'Cloud Grey', background: '#f3f4f5', foreground: '#26292c', paper: '#fbfbfb', paperDeep: '#e7e9ea', inkSoft: '#6a6f74', inkFaint: '#9ba0a4', line: '#dee0e2', lineStrong: '#c8cbce', accent: '#5a6a78', accentDark: '#42525e', accentWash: '#e0e5e8' }),
  t({ id: 'sunset-boulevard', label: 'Sunset Boulevard', dark: true, background: '#1e0f18', foreground: '#f5e3ee', paper: '#2a1524', paperDeep: '#140a10', inkSoft: '#ab87a0', inkFaint: '#74596c', line: '#3a1f34', lineStrong: '#522c48', accent: '#ff8a5a', accentDark: '#e06840', accentWash: '#45203a' }),
  t({ id: 'glacier', label: 'Glacier', background: '#eef4f8', foreground: '#1e3038', paper: '#f9fcfe', paperDeep: '#deeaf1', inkSoft: '#5b7684', inkFaint: '#8ba5b2', line: '#d2e2ec', lineStrong: '#b8cede', accent: '#2e90c0', accentDark: '#1f72a0', accentWash: '#d6e9f4' }),
]

export const DEFAULT_THEME = 'warm-paper'

export function getTheme(id: string): ThemePreset {
  return THEMES.find((x) => x.id === id) ?? THEMES[0]
}

export function applyTheme(id: string) {
  const th = getTheme(id)
  const root = document.documentElement
  root.setAttribute('data-nova-theme', th.id)
  const vars: Record<string, string> = {
    '--background': th.background, '--foreground': th.foreground, '--paper': th.paper,
    '--paper-deep': th.paperDeep, '--ink-soft': th.inkSoft, '--ink-faint': th.inkFaint,
    '--line': th.line, '--line-strong': th.lineStrong, '--accent': th.accent,
    '--accent-dark': th.accentDark, '--accent-wash': th.accentWash,
    '--accent-green': th.accentGreen, '--accent-blue': th.accentBlue,
    '--accent-purple': th.accentPurple, '--accent-gold': th.accentGold,
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}
