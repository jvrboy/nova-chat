export type ThemeId =
  | "light"
  | "dark"
  | "nord"
  | "dracula"
  | "solarized"
  | "cyberpunk"
  | "tokyo-night"
  | "gruvbox"
  | "midnight";

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  isDark: boolean;
  className?: string;
  swatch: string[]; // 4 colors preview
}

export const THEMES: Theme[] = [
  {
    id: "light",
    name: "Light",
    description: "Clean, bright, distraction-free",
    isDark: false,
    swatch: ["#ffffff", "#f4f4f5", "#18181b", "#71717a"],
  },
  {
    id: "dark",
    name: "Dark",
    description: "Default dark mode — pure neutral",
    isDark: true,
    className: "dark",
    swatch: ["#0a0a0a", "#18181b", "#fafafa", "#71717a"],
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic, north-bluish color palette",
    isDark: true,
    className: "theme-nord",
    swatch: ["#2e3440", "#3b4252", "#88c0d0", "#d8dee9"],
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Dark, vibrant purple/pink palette",
    isDark: true,
    className: "theme-dracula",
    swatch: ["#282a36", "#44475a", "#bd93f9", "#f8f8f2"],
  },
  {
    id: "solarized",
    name: "Solarized Dark",
    description: "Precision colors for machines and humans",
    isDark: true,
    className: "theme-solarized",
    swatch: ["#002b36", "#073642", "#2aa198", "#93a1a1"],
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Neon pink and electric cyan",
    isDark: true,
    className: "theme-cyberpunk",
    swatch: ["#0a0118", "#1a0a3a", "#ff2a6d", "#05d9e8"],
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "A clean, calming dark theme inspired by Tokyo",
    isDark: true,
    className: "theme-tokyo-night",
    swatch: ["#1a1b26", "#24283b", "#7aa2f7", "#c0caf5"],
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    description: "Retro groove — warm, retro colors",
    isDark: true,
    className: "theme-gruvbox",
    swatch: ["#282828", "#3c3836", "#fabd2f", "#ebdbb2"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep, calm blue darkness",
    isDark: true,
    className: "theme-midnight",
    swatch: ["#0a0e1f", "#161b35", "#6a8cff", "#d4d8f0"],
  },
];

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) || THEMES[1];
}

export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const theme = getTheme(id);
  const html = document.documentElement;
  // Remove all theme classes
  html.classList.remove("dark", "theme-nord", "theme-dracula", "theme-solarized", "theme-cyberpunk", "theme-tokyo-night", "theme-gruvbox", "theme-midnight");
  if (id === "light") {
    html.classList.remove("dark");
  } else {
    if (theme.className) html.classList.add(theme.className);
    else html.classList.add("dark");
  }
}
