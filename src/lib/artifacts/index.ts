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
    | "mermaid"
    | "react"
    | "python"
    | "sql"
    | "latex"
    | "dotenv"
    | "shell";
  language?: string;
  content: string;
  mimeType?: string;
  tags?: string[];
  /** Optional description for the artifact — used in the UI tooltip */
  description?: string;
}

export const ARTIFACT_TYPES: { id: string; name: string; description: string; ext: string; mime: string; category?: string }[] = [
  { id: "markdown", name: "Markdown", description: "Document with formatting", ext: "md", mime: "text/markdown", category: "document" },
  { id: "text", name: "Plain Text", description: "Raw text file", ext: "txt", mime: "text/plain", category: "document" },
  { id: "code", name: "Code", description: "Source code (any language)", ext: "txt", mime: "text/plain", category: "code" },
  { id: "html", name: "HTML", description: "Standalone HTML page", ext: "html", mime: "text/html", category: "document" },
  { id: "json", name: "JSON", description: "Structured data", ext: "json", mime: "application/json", category: "data" },
  { id: "csv", name: "CSV", description: "Tabular data", ext: "csv", mime: "text/csv", category: "data" },
  { id: "yaml", name: "YAML", description: "Config / data", ext: "yaml", mime: "application/x-yaml", category: "data" },
  { id: "xml", name: "XML", description: "Markup data", ext: "xml", mime: "application/xml", category: "data" },
  { id: "svg", name: "SVG Image", description: "Vector image", ext: "svg", mime: "image/svg+xml", category: "media" },
  { id: "mermaid", name: "Mermaid Diagram", description: "Diagram source", ext: "mmd", mime: "text/x-mermaid", category: "diagram" },
  { id: "react", name: "React Component", description: "TSX/JSX React component", ext: "tsx", mime: "text/typescript", category: "code" },
  { id: "python", name: "Python Script", description: "Python source code", ext: "py", mime: "text/x-python", category: "code" },
  { id: "sql", name: "SQL Query", description: "Database query / migration", ext: "sql", mime: "application/sql", category: "data" },
  { id: "latex", name: "LaTeX Document", description: "LaTeX source for academic documents", ext: "tex", mime: "application/x-latex", category: "document" },
  { id: "dotenv", name: "Env File", description: "Environment variables template", ext: "env", mime: "text/plain", category: "config" },
  { id: "shell", name: "Shell Script", description: "Bash/shell script", ext: "sh", mime: "application/x-sh", category: "code" },
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
  /** Optional title (from a `title="..."` modifier on the fence) */
  title?: string;
}

/**
 * Parses artifact blocks from a markdown reply. Supports two fence syntaxes:
 *   ```artifact:code:typescript
 *   ```artifact:markdown title="My Doc"
 * Backward compatible with the old regex (no title attribute).
 */
export function parseArtifactsFromMarkdown(md: string): ParsedArtifact[] {
  const out: ParsedArtifact[] = [];
  const re = /```artifact:([a-z0-9]+)(?::([a-z0-9+#-]+))?(?:\s+title="([^"]+)")?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    out.push({
      type: m[1],
      language: m[2],
      title: m[3],
      content: m[4].trim(),
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

/**
 * Validates an artifact's content. Returns a list of issues (empty = valid).
 * Used by the artifact panel to warn users before saving.
 */
export function validateArtifact(spec: ArtifactSpec): string[] {
  const issues: string[] = [];
  if (!spec.content || !spec.content.trim()) issues.push("Content is empty");
  if (spec.content.length > 1_000_000) issues.push("Content exceeds 1MB limit");

  // Type-specific validation
  if (spec.type === "json") {
    try {
      JSON.parse(spec.content);
    } catch (e) {
      issues.push(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
    }
  }
  if (spec.type === "yaml" || spec.type === "csv") {
    // Basic structural check
    if (spec.type === "csv" && spec.content) {
      const lines = spec.content.split("\n").filter(Boolean)
      if (lines.length > 0) {
        const firstCols = lines[0].split(",").length
        if (firstCols < 2) issues.push("CSV should have at least 2 columns in the header row")
      }
    }
  }
  if (spec.type === "svg") {
    if (!spec.content.includes("<svg")) issues.push("SVG artifact should contain an <svg> root element")
  }
  if (spec.type === "html") {
    if (!spec.content.includes("<")) issues.push("HTML artifact should contain HTML markup")
  }
  if (spec.type === "mermaid") {
    const validKw = ["graph", "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram", "journey", "gantt", "pie", "gitGraph", "mindmap"]
    if (!validKw.some((kw) => spec.content.trim().startsWith(kw))) {
      issues.push(`Mermaid should start with one of: ${validKw.join(", ")}`)
    }
  }
  if (spec.type === "react") {
    if (!/export\s+(default\s+)?(function|const|class)\s+\w+/.test(spec.content)) {
      issues.push("React artifact should export a component (function/const/class)")
    }
  }
  return issues
}

/** Returns true if the artifact type is renderable inline (HTML/SVG/Mermaid/React). */
export function isRenderable(type: string): boolean {
  return ["html", "svg", "mermaid", "react"].includes(type)
}

/** Returns true if the artifact type is downloadable as a file. */
export function isDownloadable(type: string): boolean {
  return !["mermaid"].includes(type)
}
