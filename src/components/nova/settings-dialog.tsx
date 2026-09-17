"use client";

import { useState, useEffect, useRef } from "react";
import { useNova } from "@/components/nova-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { THEMES, type ThemeId } from "@/lib/themes";
import { FONTS } from "@/lib/fonts";
import {
  Palette, Type, Sliders, Key, Plus, Trash2, Save, Brain, Wrench,
  Server, Check, AlertTriangle, Download, Eye,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const { settings, saveSettings } = useNova();
  const [activeTab, setActiveTab] = useState("appearance");
  const [setupStatus, setSetupStatus] = useState<any>(null);

  useEffect(() => {
    fetch("/api/setup").then((r) => r.json()).then(setSetupStatus).catch(() => {});
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="size-5" /> Nova Chat Settings
          </DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-6 mx-4 mt-2 h-9">
            <TabsTrigger value="appearance" className="text-xs">Appearance</TabsTrigger>
            <TabsTrigger value="model" className="text-xs">Model</TabsTrigger>
            <TabsTrigger value="prompts" className="text-xs">Prompts</TabsTrigger>
            <TabsTrigger value="tools" className="text-xs">Tools</TabsTrigger>
            <TabsTrigger value="apikeys" className="text-xs">API Keys</TabsTrigger>
            <TabsTrigger value="backend" className="text-xs">Backend</TabsTrigger>
          </TabsList>
          <ScrollArea className="flex-1 scrollbar-thin">
            <div className="p-6">
              <TabsContent value="appearance" className="mt-0 space-y-6">
                <AppearanceTab settings={settings} saveSettings={saveSettings} />
              </TabsContent>
              <TabsContent value="model" className="mt-0 space-y-6">
                <ModelTab settings={settings} saveSettings={saveSettings} />
              </TabsContent>
              <TabsContent value="prompts" className="mt-0 space-y-6">
                <PromptsTab settings={settings} saveSettings={saveSettings} />
              </TabsContent>
              <TabsContent value="tools" className="mt-0 space-y-6">
                <ToolsTab />
              </TabsContent>
              <TabsContent value="apikeys" className="mt-0 space-y-6">
                <ApiKeysTab settings={settings} saveSettings={saveSettings} />
              </TabsContent>
              <TabsContent value="backend" className="mt-0 space-y-6">
                <BackendTab status={setupStatus} onRefresh={() => fetch("/api/setup").then((r) => r.json()).then(setSetupStatus)} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, description, children, icon: Icon }: any) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {Icon && <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><Icon className="size-4 text-primary" /></div>}
        <div>
          <div className="text-sm font-medium">{title}</div>
          {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
        </div>
      </div>
      <div className="ml-11">{children}</div>
    </div>
  );
}

function AppearanceTab({ settings, saveSettings }: any) {
  return (
    <>
      <Section title="Theme" description="Pick a color theme — applied instantly" icon={Palette}>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => saveSettings({ theme: t.id })}
              className={`flex flex-col items-start gap-2 p-2.5 border rounded-md hover:bg-accent transition ${settings.theme === t.id ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="flex w-full gap-0.5 h-6 rounded-sm overflow-hidden">
                {t.swatch.map((c, i) => (
                  <div key={i} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-medium">{t.name}</span>
                {settings.theme === t.id && <Check className="size-3 text-primary" />}
              </div>
              <span className="text-[10px] text-muted-foreground text-left">{t.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Fonts" description="Sans / Mono / Display fonts" icon={Type}>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Body (Sans)</Label>
            <Select value={settings.fontSans} onValueChange={(v) => saveSettings({ fontSans: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTS.filter((f) => f.category === "sans" || f.category === "serif").map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span style={{ fontFamily: f.fontFamily }}>{f.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{f.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Code (Mono)</Label>
            <Select value={settings.fontMono} onValueChange={(v) => saveSettings({ fontMono: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTS.filter((f) => f.category === "mono").map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span style={{ fontFamily: f.fontFamily }}>{f.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{f.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Display (Headings)</Label>
            <Select value={settings.fontDisplay} onValueChange={(v) => saveSettings({ fontDisplay: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTS.filter((f) => f.category === "display" || f.category === "sans").map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span style={{ fontFamily: f.fontFamily }}>{f.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{f.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Density & Behavior" description="Layout and interaction preferences" icon={Sliders}>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Density</Label>
            <Select value={settings.density} onValueChange={(v) => saveSettings({ density: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact (tight spacing)</SelectItem>
                <SelectItem value="comfortable">Comfortable (default)</SelectItem>
                <SelectItem value="cozy">Cozy (extra padding)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Reduce motion</Label>
              <p className="text-xs text-muted-foreground">Minimize animations and transitions</p>
            </div>
            <Switch
              checked={settings.reduceMotion}
              onCheckedChange={(v) => saveSettings({ reduceMotion: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Send on Enter</Label>
              <p className="text-xs text-muted-foreground">Off = Ctrl/Cmd+Enter to send</p>
            </div>
            <Switch
              checked={settings.sendOnEnter}
              onCheckedChange={(v) => saveSettings({ sendOnEnter: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Show reasoning</Label>
              <p className="text-xs text-muted-foreground">Display model "thinking" steps</p>
            </div>
            <Switch
              checked={settings.showThinking}
              onCheckedChange={(v) => saveSettings({ showThinking: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Token counter</Label>
              <p className="text-xs text-muted-foreground">Show token count per message</p>
            </div>
            <Switch
              checked={settings.showTokenCount}
              onCheckedChange={(v) => saveSettings({ showTokenCount: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Streaming responses</Label>
              <p className="text-xs text-muted-foreground">Stream tokens as they arrive</p>
            </div>
            <Switch
              checked={settings.streamingEnabled}
              onCheckedChange={(v) => saveSettings({ streamingEnabled: v })}
            />
          </div>
        </div>
      </Section>
    </>
  );
}

function ModelTab({ settings, saveSettings }: any) {
  const [models, setModels] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, []);
  return (
    <Section title="Default Model" description="Used when starting new chats" icon={Brain}>
      <div className="space-y-3">
        <Select value={settings.defaultModel} onValueChange={(v) => saveSettings({ defaultModel: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex items-center gap-2">
                  <span>{m.name}</span>
                  <Badge variant="outline" className="text-[10px]">{m.context}</Badge>
                </div>
                <span className="text-xs text-muted-foreground ml-2">{m.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div>
          <Label className="text-xs">Temperature: {settings.defaultTemperature?.toFixed(2)}</Label>
          <Slider
            value={[settings.defaultTemperature ?? 0.7]}
            onValueChange={([v]) => saveSettings({ defaultTemperature: v })}
            min={0} max={2} step={0.05}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">Lower = focused/factual, Higher = creative/diverse</p>
        </div>
        <div>
          <Label className="text-xs">Max tokens: {settings.defaultMaxTokens}</Label>
          <Slider
            value={[settings.defaultMaxTokens ?? 4096]}
            onValueChange={([v]) => saveSettings({ defaultMaxTokens: v })}
            min={256} max={32768} step={256}
            className="mt-2"
          />
        </div>
      </div>
    </Section>
  );
}

function PromptsTab({ settings, saveSettings }: any) {
  const [prompts, setPrompts] = useState(settings.customSystemPrompts || []);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setPrompts(settings.customSystemPrompts || []); }, [settings.customSystemPrompts]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return (
    <Section title="System Prompt Library" description="Reusable system prompts — pick when starting a chat" icon={Brain}>
      <div className="space-y-3">
        {prompts.map((p: any, i: number) => (
          <div key={p.id || i} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Input
                value={p.name}
                onChange={(e) => {
                  const next = [...prompts];
                  next[i] = { ...p, name: e.target.value };
                  setPrompts(next);
                }}
                className="h-8 font-medium"
              />
              <Button
                variant="ghost" size="icon" className="size-8 ml-2"
                onClick={() => {
                  const next = prompts.filter((_, idx) => idx !== i);
                  setPrompts(next);
                  saveSettings({ customSystemPrompts: next });
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Textarea
              value={p.prompt}
              onChange={(e) => {
                const next = [...prompts];
                next[i] = { ...p, prompt: e.target.value };
                setPrompts(next);
              }}
              className="text-xs min-h-[80px]"
            />
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = [...prompts, { id: `p${Date.now()}`, name: "New prompt", prompt: "" }];
            setPrompts(next);
            saveSettings({ customSystemPrompts: next });
          }}
        >
          <Plus className="size-3.5 mr-1" /> Add prompt
        </Button>
        <Button
          size="sm"
          className="ml-2"
          onClick={() => saveSettings({ customSystemPrompts: prompts })}
        >
          <Save className="size-3.5 mr-1" /> Save all
        </Button>
      </div>
    </Section>
  );
}

function ToolsTab() {
  const [tools, setTools] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/tools").then((r) => r.json()).then((d) => setTools(d.tools || [])).catch(() => {});
  }, []);
  const categories = Array.from(new Set(tools.map((t) => t.category)));
  return (
    <Section title="Backend Tools" description="Tools Nova can invoke on your behalf" icon={Wrench}>
      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat}>
            <div className="text-xs font-medium capitalize mb-2">{cat}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tools.filter((t) => t.category === cat).map((t) => (
                <div key={t.id} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                    </div>
                    <Badge variant={
                      t.risk === "safe" ? "secondary" :
                      t.risk === "review" ? "outline" : "destructive"
                    } className="text-[10px] capitalize shrink-0">{t.risk}</Badge>
                  </div>
                  {t.params?.length > 0 && (
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      {t.params.map((p: any) => (
                        <code key={p.name} className="mr-2">{p.name}{p.required ? "*" : ""}</code>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ApiKeysTab({ settings, saveSettings }: any) {
  const [keys, setKeys] = useState(settings.apiKeys || {});
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setKeys(settings.apiKeys || {}); }, [settings.apiKeys]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return (
    <Section title="API Keys" description="Provider keys for external services (stored encrypted, never in browser)" icon={Key}>
      <div className="space-y-3">
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 p-3 flex gap-2">
          <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
          <p className="text-xs text-yellow-800 dark:text-yellow-300">
            Keys are stored encrypted in your Supabase database. They are NEVER exposed to the browser.
            Backend tools use these to call provider APIs on your behalf.
          </p>
        </div>
        {[
          { id: "openai", label: "OpenAI API Key", placeholder: "sk-..." },
          { id: "anthropic", label: "Anthropic API Key", placeholder: "sk-ant-..." },
          { id: "google", label: "Google AI Key", placeholder: "AIza..." },
          { id: "huggingface", label: "Hugging Face Token", placeholder: "hf_..." },
          { id: "github", label: "GitHub Token", placeholder: "ghp_..." },
          { id: "firecrawl", label: "Firecrawl API Key", placeholder: "fc-..." },
        ].map((k) => (
          <div key={k.id}>
            <Label className="text-xs">{k.label}</Label>
            <Input
              type="password"
              value={(keys[k.id] as string) || ""}
              onChange={(e) => setKeys({ ...keys, [k.id]: e.target.value })}
              placeholder={k.placeholder}
              className="mt-1 font-mono text-xs"
            />
          </div>
        ))}
        <Button size="sm" onClick={() => saveSettings({ apiKeys: keys })}>
          <Save className="size-3.5 mr-1" /> Save keys
        </Button>
      </div>
    </Section>
  );
}

function BackendTab({ status, onRefresh }: any) {
  const [schema, setSchema] = useState<string>("");
  useEffect(() => {
    fetch("/api/setup", { method: "POST" }).then((r) => r.json()).then((d) => setSchema(d.sql || "")).catch(() => {});
  }, []);
  return (
    <Section title="Backend Status" description="Storage and deployment info" icon={Server}>
      <div className="space-y-3">
        <div className="border rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Storage backend</span>
            <Badge variant={status?.supabase === "configured" ? "default" : "outline"}>
              {status?.storage || "checking..."}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{status?.message}</p>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <Eye className="size-3.5 mr-1" /> Refresh
          </Button>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <div className="text-sm font-medium">Supabase Setup</div>
          <p className="text-xs text-muted-foreground">
            To switch from local SQLite to Supabase (production):
          </p>
          <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
            <li>Create a Supabase project at supabase.com</li>
            <li>Open SQL Editor and run the schema below</li>
            <li>Get your Project URL + anon key + service role key</li>
            <li>Set them as env vars in Cloudflare Pages (or .env locally)</li>
          </ol>
          <div className="flex gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => {
                const blob = new Blob([schema], { type: "text/sql" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "nova-chat-schema.sql";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="size-3.5 mr-1" /> Download SQL schema
            </Button>
          </div>
          <details>
            <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">View SQL</summary>
            <pre className="text-[10px] mt-2 max-h-64 overflow-auto scrollbar-thin bg-muted/50 p-2 rounded font-mono">{schema}</pre>
          </details>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <div className="text-sm font-medium">Environment Variables</div>
          <pre className="text-[10px] bg-muted/50 p-2 rounded font-mono">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...`}
          </pre>
        </div>
      </div>
    </Section>
  );
}
