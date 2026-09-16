"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useNova } from "@/components/nova-provider";
import { ArtifactCard } from "@/components/nova/artifact-card";
import { Button } from "@/components/ui/button";
import { ScrollText, User, Sparkles, Wrench, AlertCircle, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Props {
  message: {
    id: string;
    role: string;
    content: string;
    status: string;
    model?: string | null;
    toolName?: string | null;
    toolOutput?: string | null;
    artifactIds?: string[];
    tokensOut?: number | null;
    createdAt: string;
  };
}

export function ChatMessage({ message }: Props) {
  const { settings, streaming, openArtifact, artifacts, regenerateLast } = useNova();
  const isStreaming = streaming.messageId === message.id && streaming.isStreaming;
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  // Parse out artifact blocks from the assistant message
  const { markdownWithoutArtifacts, messageArtifacts } = useMemo(() => {
    const md = message.content || "";
    const re = /```artifact:([a-z0-9]+)(?::([a-z0-9+#-]+))?\n([\s\S]*?)```/g;
    const arts: { type: string; language?: string; content: string; title: string }[] = [];
    let stripped = md;
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      const title = inferTitle(m[3], m[1]);
      arts.push({ type: m[1], language: m[2], content: m[3].trim(), title });
    }
    stripped = md.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
    return { markdownWithoutArtifacts: stripped, messageArtifacts: arts };
  }, [message.content]);

  // Match artifact IDs to message artifacts by order
  const artifactIdList = message.artifactIds || [];
  const isDark = settings.theme !== "light";

  const copyContent = () => {
    navigator.clipboard.writeText(message.content || "");
    toast.success("Copied to clipboard");
  };

  if (isTool) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 my-2 text-sm">
        <Wrench className="size-4 mt-0.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="font-medium mb-1">Tool: {message.toolName}</div>
          <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground max-h-48 overflow-auto scrollbar-thin">
            {message.toolOutput || message.content}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex gap-3 py-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "size-8 shrink-0 rounded-md flex items-center justify-center text-xs font-medium",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-gradient-to-br from-primary/20 to-accent/30 text-foreground"
      )}>
        {isUser ? <User className="size-4" /> : <Sparkles className="size-4" />}
      </div>
      <div className={cn("flex-1 min-w-0 max-w-3xl", isUser && "flex flex-col items-end")}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className="font-medium">{isUser ? "You" : "Nova"}</span>
          {message.model && !isUser && <span>· {message.model}</span>}
          {message.tokensOut && !isUser && settings.showTokenCount && (
            <span>· {message.tokensOut} tokens</span>
          )}
          {isStreaming && <span className="text-primary">· streaming…</span>}
          {message.status === "error" && <span className="text-destructive">· error</span>}
        </div>

        {markdownWithoutArtifacts ? (
          <div className={cn(
            "prose prose-sm dark:prose-invert max-w-none break-words",
            isUser && "bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 prose-invert"
          )}>
            <ReactMarkdown
              components={{
                code({ className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || "");
                  const code = String(children).replace(/\n$/, "");
                  if (!match && !code.includes("\n")) {
                    // Inline code
                    return (
                      <code className="px-1 py-0.5 rounded bg-muted/60 text-foreground text-[0.85em]" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return (
                    <SyntaxHighlighter
                      style={isDark ? oneDark : oneLight}
                      language={match?.[1] || "text"}
                      PreTag="div"
                      className="!text-xs !rounded-md !bg-muted/50"
                    >
                      {code}
                    </SyntaxHighlighter>
                  );
                },
                pre({ children }: any) {
                  return <>{children}</>;
                },
              }}
            >
              {markdownWithoutArtifacts}
            </ReactMarkdown>
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Sparkles className="size-3 animate-pulse" />
            <span>thinking…</span>
          </div>
        ) : null}

        {/* Artifact cards */}
        {messageArtifacts.length > 0 && (
          <div className="mt-3 space-y-2 w-full">
            {messageArtifacts.map((a, i) => {
              const id = artifactIdList[i];
              const fullArtifact = artifacts.find((x) => x.id === id);
              return (
                <ArtifactCard
                  key={i}
                  artifact={{
                    id: id || `temp-${i}`,
                    type: a.type,
                    language: a.language,
                    title: a.title,
                    content: fullArtifact?.content || a.content,
                    updatedAt: fullArtifact?.updatedAt || message.createdAt,
                  }}
                  onOpen={() => id && openArtifact(id)}
                />
              );
            })}
          </div>
        )}

        {/* Action buttons for assistant messages */}
        {!isUser && !isStreaming && message.status === "complete" && (
          <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="size-7" onClick={copyContent}>
              <Copy className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={regenerateLast}>
              <RefreshCw className="size-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function inferTitle(content: string, type: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) return trimmed.replace(/^#+\s*/, "").slice(0, 80);
    return trimmed.slice(0, 80);
  }
  return `Untitled ${type}`;
}
