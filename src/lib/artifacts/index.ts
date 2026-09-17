// Pure helpers (no server-side imports). Safe for client components.

export interface ArtifactSpec {
  title: string;
  type:
    | "markdown"
    | "text"
    | "code"
    | "html"
    | "json"
    | "csv"
    | "yaml"
    | "xml"
    | "svg"
    | "mermaid";
  language?: string;
  content: string;
  mimeType?: string;
  tags?: string[];
}

export const ARTIFACT_TYPES: { id: string; name: string; description: string; ext: string; mime: string }[] = [
  { id: "markdown", name: "Markdown", description: "Document with formatting", ext: "md", mime: "text/markdown" },
  { id: "text", name: "Plain Text", description: "Raw text file", ext: "txt", mime: "text/plain" },
  { id: "code", name: "Code", description: "Source code (any language)", ext: "txt", mime: "text/plain" },
  { id: "html", name: "HTML", description: "Standalone HTML page", ext: "html", mime: "text/html" },
  { id: "json", name: "JSON", description: "Structured data", ext: "json", mime: "application/json" },
  { id: "csv", name: "CSV", description: "Tabular data", ext: "csv", mime: "text/csv" },
  { id: "yaml", name: "YAML", description: "Config / data", ext: "yaml", mime: "application/x-yaml" },
  { id: "xml", name: "XML", description: "Markup data", ext: "xml", mime: "application/xml" },
  { id: "svg", name: "SVG Image", description: "Vector image", ext: "svg", mime: "image/svg+xml" },
  { id: "mermaid", name: "Mermaid Diagram", description: "Diagram source", ext: "mmd", mime: "text/x-mermaid" },
];

export function getArtifactExt(type: string, language?: string): string {
  if (type === "code" && language) {
    const langExt: Record<string, string> = {
      javascript: "js", typescript: "ts", python: "py", rust: "rs", go: "go",
      java: "java", c: "c", cpp: "cpp", csharp: "cs", ruby: "rb", php: "php",
      swift: "swift", kotlin: "kt", scala: "scala", sql: "sql", bash: "sh",
      powershell: "ps1", lua: "lua", r: "r", haskell: "hs", elixir: "ex",
      dart: "dart", perl: "pl", yaml: "yaml", html: "html", css: "css",
    };
    return langExt[language.toLowerCase()] || "txt";
  }
  const found = ARTIFACT_TYPES.find((t) => t.id === type);
  return found?.ext || "txt";
}

export function getArtifactMime(type: string, language?: string): string {
  const found = ARTIFACT_TYPES.find((t) => t.id === type);
  if (type === "code") {
    const langMime: Record<string, string> = {
      javascript: "text/javascript", typescript: "text/typescript", python: "text/x-python",
      rust: "text/rust", go: "text/go", java: "text/x-java", html: "text/html", css: "text/css",
    };
    return langMime[language?.toLowerCase() || ""] || "text/plain";
  }
  return found?.mime || "text/plain";
}

export interface ParsedArtifact {
  type: string;
  language?: string;
  content: string;
}

export function parseArtifactsFromMarkdown(md: string): ParsedArtifact[] {
  const out: ParsedArtifact[] = [];
  const re = /```artifact:([a-z0-9]+)(?::([a-z0-9+#-]+))?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    out.push({
      type: m[1],
      language: m[2],
      content: m[3].trim(),
    });
  }
  return out;
}

export function inferTitle(content: string, type: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) return trimmed.replace(/^#+\s*/, "").slice(0, 80);
    return trimmed.slice(0, 80);
  }
  return `Untitled ${type}`;
}
