"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Code, Braces, Table, FileCode, Image, Palette, Download, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ArtifactPreview {
  id: string;
  type: string;
  language?: string;
  title: string;
  content?: string;
  updatedAt?: string;
  isPublic?: boolean;
}

const ICONS: Record<string, any> = {
  markdown: FileText,
  text: FileText,
  code: Code,
  html: FileCode,
  json: Braces,
  csv: Table,
  yaml: FileText,
  xml: FileCode,
  svg: Image,
  mermaid: Palette,
};

const LABELS: Record<string, string> = {
  markdown: "Markdown",
  text: "Text",
  code: "Code",
  html: "HTML",
  json: "JSON",
  csv: "CSV",
  yaml: "YAML",
  xml: "XML",
  svg: "SVG",
  mermaid: "Mermaid",
};

export function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: ArtifactPreview;
  onOpen?: () => void;
}) {
  const Icon = ICONS[artifact.type] || FileText;
  const label = artifact.language
    ? `${LABELS[artifact.type] || artifact.type} · ${artifact.language}`
    : LABELS[artifact.type] || artifact.type;

  return (
    <div className="border rounded-md bg-card hover:bg-accent/50 transition-colors cursor-pointer group" onClick={onOpen}>
      <div className="flex items-center gap-3 p-3">
        <div className="size-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{artifact.title}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{label}</Badge>
            {artifact.content && (
              <span>{artifact.content.length.toLocaleString()} chars</span>
            )}
            {artifact.isPublic && <Badge variant="outline" className="text-[10px] py-0 px-1.5">public</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="size-7" asChild onClick={(e) => e.stopPropagation()}>
            <a
              href={`/api/artifacts/${artifact.id}/download`}
              download
              aria-label="Download"
            >
              <Download className="size-3.5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Open">
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </div>
      {/* Preview line */}
      {artifact.content && (
        <div className="px-3 pb-2.5">
          <pre className="text-xs text-muted-foreground font-mono line-clamp-2 whitespace-pre-wrap break-all">
            {artifact.content.slice(0, 200)}
            {artifact.content.length > 200 ? "…" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
