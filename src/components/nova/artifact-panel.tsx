"use client";

import { useState, useEffect, useRef } from "react";
import { useNova } from "@/components/nova-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  X, Download, Copy, Save, FileText, Code, Braces, Table, FileCode,
  Image, Palette, Trash2, ExternalLink, RefreshCw, Code2,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { getArtifactExt, getArtifactMime } from "@/lib/artifacts";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = {
  markdown: FileText, text: FileText, code: Code2, html: FileCode,
  json: Braces, csv: Table, yaml: FileText, xml: FileCode, svg: Image, mermaid: Palette,
};

export function ArtifactPanel() {
  const {
    isArtifactPanelOpen, currentArtifactId, closeArtifactPanel, settings, artifacts,
  } = useNova();
  const artifact = artifacts.find((a) => a.id === currentArtifactId);
  const [content, setContent] = useState(() => artifact?.content || "");
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync local content when artifact changes.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (artifact) {
      setContent(artifact.content);
      setDirty(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [artifact?.id]);

  if (!isArtifactPanelOpen || !artifact) return null;

  const Icon = ICONS[artifact.type] || FileText;
  const ext = getArtifactExt(artifact.type, artifact.language || undefined);
  const mime = artifact.mimeType || getArtifactMime(artifact.type, artifact.language || undefined);
  const isDark = settings.theme !== "light";

  const save = async () => {
    try {
      await fetch(`/api/artifacts/${artifact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setDirty(false);
      toast.success("Artifact saved (version bumped)");
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    }
  };

  const download = () => {
    const url = `/api/artifacts/${artifact.id}/download`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copy = () => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  };

  const renderPreview = () => {
    if (artifact.type === "svg") {
      return (
        <div className="size-full flex items-center justify-center p-4 min-h-[400px]">
          <div className="bg-white rounded p-4" dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      );
    }
    if (artifact.type === "html") {
      return (
        <iframe
          srcDoc={content}
          className="w-full h-full min-h-[400px] border-0 bg-white"
          sandbox="allow-scripts"
        />
      );
    }
    if (artifact.type === "mermaid") {
      return (
        <div className="p-4 text-xs text-muted-foreground bg-muted/30 rounded">
          <p className="mb-2">Mermaid diagram preview (render in your viewer):</p>
          <pre className="font-mono">{content}</pre>
        </div>
      );
    }
    if (artifact.type === "markdown") {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none p-4">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      );
    }
    if (artifact.type === "json") {
      try {
        const parsed = JSON.parse(content);
        return (
          <pre className="text-xs font-mono p-4 overflow-auto scrollbar-thin h-full bg-muted/30 rounded">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        return <pre className="text-xs font-mono p-4 overflow-auto scrollbar-thin h-full bg-muted/30 rounded">{content}</pre>;
      }
    }
    // Code / others — syntax highlighted
    return (
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={artifact.language || ext}
        PreTag="div"
        className="!text-xs !h-full !overflow-auto scrollbar-thin !m-0 !rounded-none"
      >
        {content}
      </SyntaxHighlighter>
    );
  };

  return (
    <aside className="h-full w-full md:w-[440px] lg:w-[520px] xl:w-[640px] border-l bg-card flex flex-col">
      <div className="p-3 border-b flex items-center gap-2">
        <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{artifact.title}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{artifact.type}</Badge>
            {artifact.language && <Badge variant="outline" className="text-[10px] py-0 px-1.5">{artifact.language}</Badge>}
            <span>· v{artifact.version || 1}</span>
            <span>· {content.length.toLocaleString()} chars</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditMode((m) => !m)} title={editMode ? "Preview" : "Edit"}>
          {editMode ? <Code className="size-4" /> : <FileText className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={download} title="Download">
          <Download className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={closeArtifactPanel} title="Close">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {editMode ? (
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            className="w-full h-full min-h-[400px] p-4 font-mono text-xs bg-background border-0 resize-none focus:outline-none scrollbar-thin"
            placeholder="Edit content..."
          />
        ) : (
          <ScrollArea className="h-full scrollbar-thin">
            <div className="min-h-[400px]">
              {renderPreview()}
            </div>
          </ScrollArea>
        )}
      </div>
      {dirty && editMode && (
        <div className="p-2 border-t flex items-center justify-between bg-muted/30">
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setContent(artifact.content); setDirty(false); }}>
              Discard
            </Button>
            <Button size="sm" onClick={save}>
              <Save className="size-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}
      {!editMode && (
        <div className="p-2 border-t flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={copy}>
            <Copy className="size-3.5 mr-1" /> Copy
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => window.open(`/api/artifacts/${artifact.id}/download`, "_blank")}>
              <ExternalLink className="size-3.5 mr-1" /> Open
            </Button>
            <Button variant="ghost" size="sm" onClick={download}>
              <Download className="size-3.5 mr-1" /> Download .{ext}
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
