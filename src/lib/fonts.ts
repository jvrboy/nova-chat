export interface FontOption {
  id: string;
  name: string;
  category: "sans" | "mono" | "display" | "serif";
  cssVar: string;
  fontFamily: string;
  description: string;
  preview: string; // sample chars
}

export const FONTS: FontOption[] = [
  {
    id: "inter",
    name: "Inter",
    category: "sans",
    cssVar: "--font-inter",
    fontFamily: "'Inter', system-ui, sans-serif",
    description: "Optimized for screen — clean and readable",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "geist-sans",
    name: "Geist Sans",
    category: "sans",
    cssVar: "--font-geist-sans",
    fontFamily: "'Geist Sans', system-ui, sans-serif",
    description: "Vercel's geometric sans",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    category: "sans",
    cssVar: "--font-ibm-plex-sans",
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
    description: "Corporate, professional, technical",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    category: "display",
    cssVar: "--font-space-grotesk",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    description: "Geometric display — futuristic headers",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "playfair-display",
    name: "Playfair Display",
    category: "display",
    cssVar: "--font-playfair-display",
    fontFamily: "'Playfair Display', Georgia, serif",
    description: "Elegant serif display — editorial",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "lora",
    name: "Lora",
    category: "serif",
    cssVar: "--font-lora",
    fontFamily: "'Lora', Georgia, serif",
    description: "Brush-style serif — readable text",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    category: "mono",
    cssVar: "--font-jetbrains-mono",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    description: "Default code font — ligatures, clarity",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "fira-code",
    name: "Fira Code",
    category: "mono",
    cssVar: "--font-fira-code",
    fontFamily: "'Fira Code', ui-monospace, monospace",
    description: "Programming ligatures — popular with developers",
    preview: "Aa Bb Cc => !=",
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    category: "mono",
    cssVar: "--font-ibm-plex-mono",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    description: "Technical, monospaced IBM family",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "source-code-pro",
    name: "Source Code Pro",
    category: "mono",
    cssVar: "--font-source-code-pro",
    fontFamily: "'Source Code Pro', ui-monospace, monospace",
    description: "Adobe's monospaced — clean & professional",
    preview: "Aa Bb Cc 123",
  },
  {
    id: "geist-mono",
    name: "Geist Mono",
    category: "mono",
    cssVar: "--font-geist-mono",
    fontFamily: "'Geist Mono', ui-monospace, monospace",
    description: "Vercel's monospaced companion",
    preview: "Aa Bb Cc 123",
  },
];

export const DEFAULT_FONTS = {
  sans: "inter",
  mono: "jetbrains-mono",
  display: "space-grotesk",
} as const;

export function getFont(id: string): FontOption | undefined {
  return FONTS.find((f) => f.id === id);
}

export function applyFonts(fontIds: { sans: string; mono: string; display: string }) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const sansFont = getFont(fontIds.sans);
  const monoFont = getFont(fontIds.mono);
  const displayFont = getFont(fontIds.display);
  if (sansFont) root.style.setProperty("--font-app-sans", `var(${sansFont.cssVar})`);
  if (monoFont) root.style.setProperty("--font-app-mono", `var(${monoFont.cssVar})`);
  if (displayFont) root.style.setProperty("--font-app-display", `var(${displayFont.cssVar})`);
}
