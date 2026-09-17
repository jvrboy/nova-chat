// Minimal Database type (we use loose typing for the actual rows since the schema
// is generated dynamically). For full strict typing, run
// `supabase gen types typescript --project-id <id>` and replace this file.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          preferences?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["user_profiles"]["Insert"]>;
      };
      chats: {
        Row: {
          id: string;
          user_id: string | null;
          title: string;
          model: string;
          system_prompt: string | null;
          temperature: number | null;
          max_tokens: number | null;
          tools_enabled: boolean | null;
          pinned: boolean | null;
          archived: boolean | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          title?: string;
          model?: string;
          system_prompt?: string | null;
          temperature?: number | null;
          max_tokens?: number | null;
          tools_enabled?: boolean | null;
          pinned?: boolean | null;
          archived?: boolean | null;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["chats"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          chat_id: string;
          role: "user" | "assistant" | "system" | "tool";
          content: string;
          status: "streaming" | "complete" | "error" | "stopped";
          model: string | null;
          tool_name: string | null;
          tool_input: Json | null;
          tool_output: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
          finish_reason: string | null;
          metadata: Json;
          artifact_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          role?: "user" | "assistant" | "system" | "tool";
          content?: string;
          status?: "streaming" | "complete" | "error" | "stopped";
          model?: string | null;
          tool_name?: string | null;
          tool_input?: Json | null;
          tool_output?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          finish_reason?: string | null;
          metadata?: Json;
          artifact_ids?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      artifacts: {
        Row: {
          id: string;
          user_id: string | null;
          chat_id: string | null;
          message_id: string | null;
          title: string;
          type: string;
          language: string | null;
          content: string;
          storage_key: string | null;
          mime_type: string | null;
          bytes: number | null;
          version: number | null;
          parent_id: string | null;
          tags: string[];
          is_public: boolean | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          chat_id?: string | null;
          message_id?: string | null;
          title: string;
          type: string;
          language?: string | null;
          content?: string;
          storage_key?: string | null;
          mime_type?: string | null;
          bytes?: number | null;
          version?: number;
          parent_id?: string | null;
          tags?: string[];
          is_public?: boolean;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["artifacts"]["Insert"]>;
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          theme: string;
          font_sans: string;
          font_mono: string;
          font_display: string;
          density: string;
          accent_color: string | null;
          reduce_motion: boolean;
          send_on_enter: boolean;
          show_thinking: boolean;
          show_token_count: boolean;
          streaming_enabled: boolean;
          default_model: string;
          default_temperature: number;
          default_max_tokens: number;
          api_keys: Json;
          custom_system_prompts: Json;
          tool_permissions: Json;
          shortcuts: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["user_settings"]["Row"]> & {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Insert"]>;
      };
      tool_runs: {
        Row: {
          id: string;
          user_id: string | null;
          chat_id: string | null;
          message_id: string | null;
          tool_name: string;
          tool_input: Json;
          tool_output: Json | null;
          status: string;
          risk_level: string;
          approved_by: string | null;
          approved_at: string | null;
          duration_ms: number | null;
          error: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tool_runs"]["Row"]> & {
          tool_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["tool_runs"]["Insert"]>;
      };
      memories: {
        Row: {
          id: string;
          user_id: string | null;
          chat_id: string | null;
          content: string;
          source: string | null;
          tags: string[];
          importance: number | null;
          embedding: number[] | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["memories"]["Row"]> & {
          content: string;
        };
        Update: Partial<Database["public"]["Tables"]["memories"]["Insert"]>;
      };
      file_uploads: {
        Row: {
          id: string;
          user_id: string | null;
          chat_id: string | null;
          storage_key: string;
          original_name: string;
          mime_type: string | null;
          bytes: number | null;
          text_content: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["file_uploads"]["Row"]> & {
          storage_key: string;
          original_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["file_uploads"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_or_create_default_user: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: {
      artifact_type:
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
        | "image"
        | "pdf"
        | "document"
        | "spreadsheet"
        | "presentation";
      message_role: "user" | "assistant" | "system" | "tool";
      message_status: "streaming" | "complete" | "error" | "stopped";
      tool_run_status:
        | "pending"
        | "approved"
        | "rejected"
        | "running"
        | "complete"
        | "error";
    };
  };
}

export type { Database as default };
