// Type definitions shared between client and server.
// This file has NO runtime dependencies on Prisma, so it's safe to import from client components.

export interface ChatRow {
  id: string;
  title: string;
  model: string;
  systemPrompt?: string | null;
  temperature?: number;
  maxTokens?: number;
  toolsEnabled?: boolean;
  pinned?: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "streaming" | "complete" | "error" | "stopped";

export interface MessageRow {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  model?: string | null;
  toolName?: string | null;
  toolInput?: any;
  toolOutput?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  finishReason?: string | null;
  artifactIds?: string[];
  createdAt: string;
}

export interface ArtifactRow {
  id: string;
  chatId?: string | null;
  messageId?: string | null;
  title: string;
  type: string;
  language?: string | null;
  content: string;
  mimeType?: string | null;
  bytes?: number | null;
  version?: number;
  tags?: string[];
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsRow {
  theme: string;
  fontSans: string;
  fontMono: string;
  fontDisplay: string;
  density: string;
  accentColor?: string | null;
  reduceMotion: boolean;
  sendOnEnter: boolean;
  showThinking: boolean;
  showTokenCount: boolean;
  streamingEnabled: boolean;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  apiKeys: Record<string, string>;
  customSystemPrompts: Array<{ id: string; name: string; prompt: string; }>;
  toolPermissions: Record<string, "allow" | "ask" | "deny">;
  shortcuts: Record<string, string>;
}

export const DEFAULT_SETTINGS: SettingsRow = {
  theme: "dark",
  fontSans: "inter",
  fontMono: "jetbrains-mono",
  fontDisplay: "space-grotesk",
  density: "comfortable",
  accentColor: null,
  reduceMotion: false,
  sendOnEnter: true,
  showThinking: true,
  showTokenCount: false,
  streamingEnabled: true,
  defaultModel: "glm-4.6",
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
  apiKeys: {},
  customSystemPrompts: [
    {
      id: "coding",
      name: "Senior Engineer",
      prompt:
        "You are a senior software engineer. Write clean, well-tested code with clear documentation. Always include error handling and consider edge cases. Prefer simple, readable solutions over clever ones.",
    },
    {
      id: "writing",
      name: "Editor",
      prompt:
        "You are a professional editor. Improve clarity, fix grammar, and tighten prose without changing the author's voice. Explain major changes briefly.",
    },
    {
      id: "analyst",
      name: "Data Analyst",
      prompt:
        "You are a data analyst. Provide concise, accurate analysis grounded in the data. Cite specific numbers. Suggest visualizations where appropriate.",
    },
  ],
  toolPermissions: {},
  shortcuts: {
    newChat: "Ctrl+K",
    send: "Ctrl+Enter",
    settings: "Ctrl+,",
  },
};

export interface ToolRunRow {
  id: string;
  chatId?: string | null;
  toolName: string;
  toolInput: any;
  toolOutput?: any;
  status: string;
  riskLevel: string;
  durationMs?: number | null;
  error?: string | null;
  createdAt: string;
}
