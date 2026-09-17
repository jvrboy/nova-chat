// Settings schema for Nova web. Drives a professionally-organised, searchable
// settings UI with 130+ options across 7 categories. Each control is typed and
// applies live (stored in localStorage, some emit CSS variables / behaviour).

import { THEMES } from './theme'
import { FONTS, FONT_SLOTS } from './fonts'

export type SettingType = 'toggle' | 'select' | 'slider' | 'color' | 'text'

export type SettingDef = {
  id: string
  label: string
  hint?: string
  type: SettingType
  def: unknown
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  unit?: string
  group: string
}

export type Category = {
  id: string
  title: string
  blurb: string
  groups: { name: string; settings: SettingDef[] }[]
}

const themeOptions = THEMES.map((t) => ({ value: t.id, label: t.label }))
const fontOptions = (slot: (typeof FONT_SLOTS)[number]) => FONTS[slot].map((f) => ({ value: f.id, label: f.label }))
const bool = (id: string, label: string, group: string, def = true, hint?: string): SettingDef => ({ id, label, hint, type: 'toggle', def, group })
const slider = (id: string, label: string, group: string, def: number, min: number, max: number, step = 1, unit = '', hint?: string): SettingDef => ({ id, label, hint, type: 'slider', def, min, max, step, unit, group })
const select = (id: string, label: string, group: string, def: string, options: { value: string; label: string }[], hint?: string): SettingDef => ({ id, label, hint, type: 'select', def, options, group })
const color = (id: string, label: string, group: string, def: string, hint?: string): SettingDef => ({ id, label, hint, type: 'color', def, group })

export const CATEGORIES: Category[] = [
  {
    id: 'general',
    title: 'General',
    blurb: 'Core workspace behaviour and defaults.',
    groups: [
      {
        name: 'Workspace',
        settings: [
          select('g.language', 'Interface language', 'Workspace', 'en', [{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'de', label: 'Deutsch' }, { value: 'pt', label: 'Português' }, { value: 'ja', label: '日本語' }]),
          select('g.startup', 'On startup', 'Workspace', 'home', [{ value: 'home', label: 'Home' }, { value: 'chat', label: 'New chat' }, { value: 'last', label: 'Last conversation' }, { value: 'studio', label: 'Studio' }]),
          select('g.landing', 'Default landing view', 'Workspace', 'home', [{ value: 'home', label: 'Home' }, { value: 'chat', label: 'Chats' }, { value: 'projects', label: 'Projects' }, { value: 'artifacts', label: 'Artifacts' }]),
          bool('g.restore', 'Restore last session on launch', 'Workspace', true),
          bool('g.confirmDelete', 'Confirm before deleting a conversation', 'Workspace', true),
          bool('g.confirmLeave', 'Warn before leaving an unsent draft', 'Workspace', false),
          select('g.dateFormat', 'Date format', 'Workspace', 'system', [{ value: 'system', label: 'System default' }, { value: 'dmy', label: 'DD/MM/YYYY' }, { value: 'mdy', label: 'MM/DD/YYYY' }, { value: 'iso', label: 'YYYY-MM-DD' }]),
          select('g.timeFormat', 'Time format', 'Workspace', '12h', [{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }]),
          select('g.units', 'Measurement units', 'Workspace', 'metric', [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }]),
          select('g.firstDay', 'Week starts on', 'Workspace', 'monday', [{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]),
        ],
      },
      {
        name: 'Regional & input',
        settings: [
          select('g.numberFormat', 'Number formatting', 'Regional & input', 'system', [{ value: 'system', label: 'System default' }, { value: 'comma', label: '1,234.56' }, { value: 'period', label: '1.234,56' }, { value: 'space', label: '1 234.56' }]),
          select('g.currency', 'Preferred currency', 'Regional & input', 'USD', [{ value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'GBP', label: 'GBP (£)' }, { value: 'JPY', label: 'JPY (¥)' }, { value: 'ZAR', label: 'ZAR (R)' }]),
          select('g.keyboardLayout', 'Keyboard layout', 'Regional & input', 'qwerty', [{ value: 'qwerty', label: 'QWERTY' }, { value: 'dvorak', label: 'Dvorak' }, { value: 'colemak', label: 'Colemak' }, { value: 'azerty', label: 'AZERTY' }]),
          bool('g.spellcheck', 'Enable spellcheck while composing', 'Regional & input', true, 'Check text as you write.'),
          bool('g.autocorrect', 'Auto-correct common typos', 'Regional & input', false),
          bool('g.smartQuotes', 'Use smart quotes', 'Regional & input', true),
        ],
      },
      {
        name: 'Session',
        settings: [
          slider('g.autosaveSec', 'Autosave drafts every', 'Session', 5, 1, 60, 1, 's', 'Save drafts automatically.'),
          bool('g.persistChats', 'Save conversations to this device', 'Session', true),
          bool('g.rememberTheme', 'Remember theme between sessions', 'Session', true),
          slider('g.sessionTimeout', 'Auto-lock after inactivity', 'Session', 0, 0, 120, 5, 'min', '0 = never.'),
          bool('g.multiTabSync', 'Sync state across open tabs', 'Session', true),
          bool('g.cloudSync', 'Sync chats & settings across devices', 'Session', true, 'Uses your sync key.'),
          bool('g.offlineMode', 'Work offline when the backend is unreachable', 'Session', true),
          slider('g.chatHistoryLimit', 'Recent chats shown in sidebar', 'Session', 20, 5, 100, 5),
        ],
      },
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    blurb: 'Theme, colour, and surface geometry.',
    groups: [
      {
        name: 'Theme',
        settings: [
          select('a.theme', 'Colour theme', 'Theme', 'warm-paper', themeOptions, '26 curated themes.'),
          select('a.mode', 'Colour mode', 'Theme', 'auto', [{ value: 'auto', label: 'Auto (follow system)' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]),
          bool('a.amoled', 'True-black dark mode (AMOLED)', 'Theme', false),
          slider('a.uiScale', 'UI scale', 'Theme', 100, 80, 130, 1, '%'),
          slider('a.borderRadius', 'Corner roundness', 'Theme', 65, 0, 100, 5, '%', 'Change message surface geometry.'),
          slider('a.accentStrength', 'Accent strength', 'Theme', 100, 50, 130, 5, '%'),
        ],
      },
      {
        name: 'Custom accent',
        settings: [
          bool('a.customAccent', 'Override theme accent colour', 'Custom accent', false),
          color('a.accentColor', 'Accent colour', 'Custom accent', '#d85a3a'),
          bool('a.tintSurfaces', 'Tint surfaces toward accent', 'Custom accent', false),
          slider('a.tintAmount', 'Surface tint amount', 'Custom accent', 10, 0, 40, 1, '%'),
        ],
      },
      {
        name: 'Layout',
        settings: [
          select('a.chatWidth', 'Chat width', 'Layout', 'normal', [{ value: 'narrow', label: 'Narrow' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full width' }]),
          select('a.density', 'Interface density', 'Layout', 'comfortable', [{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'spacious', label: 'Spacious' }]),
          bool('a.compact', 'Use tighter workspace spacing', 'Layout', false),
          bool('a.sidebarDefault', 'Show sidebar by default', 'Layout', true),
          bool('a.showSidebarLabels', 'Always show sidebar labels', 'Layout', true),
          select('a.sidebarSide', 'Sidebar position', 'Layout', 'left', [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]),
          bool('a.focusMode', 'Focus mode (dim chrome)', 'Layout', false),
          bool('a.showTopbar', 'Show top bar', 'Layout', true),
          bool('a.stickyHeader', 'Sticky chat header', 'Layout', true),
          slider('a.sidebarWidth', 'Sidebar width', 'Layout', 288, 220, 400, 4, 'px'),
          bool('a.cardShadows', 'Card shadows', 'Layout', true),
        ],
      },
      {
        name: 'Motion & effects',
        settings: [
          bool('a.animations', 'Interface animations', 'Motion & effects', true),
          bool('a.reduceMotion', 'Reduce motion (accessibility)', 'Motion & effects', false),
          slider('a.animSpeed', 'Animation speed', 'Motion & effects', 100, 25, 200, 25, '%'),
          bool('a.ambientFx', 'Ambient effects', 'Motion & effects', false),
          bool('a.glassFx', 'Frosted-glass surfaces', 'Motion & effects', false),
          slider('a.blurAmount', 'Background blur', 'Motion & effects', 8, 0, 60, 1, 'px'),
        ],
      },
    ],
  },
  {
    id: 'typography',
    title: 'Typography & fonts',
    blurb: 'Typefaces, sizing, and reading comfort.',
    groups: [
      {
        name: 'Typefaces',
        settings: [
          select('f.sans', 'Interface font', 'Typefaces', 'dm-sans', fontOptions('sans')),
          select('f.serif', 'Assistant / prose font', 'Typefaces', 'newsreader', fontOptions('serif')),
          select('f.display', 'Headline font', 'Typefaces', 'playfair', fontOptions('display')),
          select('f.mono', 'Code font', 'Typefaces', 'jetbrains', fontOptions('mono')),
        ],
      },
      {
        name: 'Sizing',
        settings: [
          slider('f.scale', 'Global font scale', 'Sizing', 100, 80, 140, 1, '%'),
          slider('f.chatSize', 'Chat text size', 'Sizing', 100, 85, 140, 5, '%'),
          slider('f.codeSize', 'Code text size', 'Sizing', 100, 80, 130, 5, '%'),
          select('f.weight', 'Interface font weight', 'Sizing', '500', [{ value: '400', label: 'Regular' }, { value: '500', label: 'Medium' }, { value: '600', label: 'Semibold' }]),
        ],
      },
      {
        name: 'Reading',
        settings: [
          slider('f.lineHeight', 'Line height', 'Reading', 165, 130, 220, 5, '%'),
          slider('f.letterSpacing', 'Letter spacing', 'Reading', 0, -5, 20, 1, ''),
          slider('f.paragraphSpace', 'Paragraph spacing', 'Reading', 100, 50, 200, 10, '%'),
          bool('f.serifReplies', 'Render assistant replies in serif', 'Reading', true),
          bool('f.ligatures', 'Enable code ligatures', 'Reading', true),
          bool('f.hyphenation', 'Auto-hyphenate long words', 'Reading', false),
        ],
      },
    ],
  },
  {
    id: 'chat',
    title: 'Chat & composer',
    blurb: 'Composer behaviour and message rendering.',
    groups: [
      {
        name: 'Composer',
        settings: [
          bool('c.enterSend', 'Press Enter to send', 'Composer', true),
          bool('c.shiftNewline', 'Use Shift + Enter for a new line', 'Composer', true),
          bool('c.smartCompose', 'Smart compose suggestions', 'Composer', true, "Use Nova's contextual drafting suggestions."),
          bool('c.autocomplete', 'Inline autocomplete', 'Composer', true),
          slider('c.composerRows', 'Composer minimum rows', 'Composer', 1, 1, 6, 1),
          slider('c.composerMax', 'Composer max height', 'Composer', 180, 80, 400, 10, 'px'),
          bool('c.autoFocus', 'Auto-focus composer on open', 'Composer', true),
          bool('c.draftPerChat', 'Keep a separate draft per chat', 'Composer', true),
          bool('c.charCount', 'Show character count', 'Composer', false),
          slider('c.charLimit', 'Character limit (0 = none)', 'Composer', 0, 0, 10000, 100),
        ],
      },
      {
        name: 'Voice & input',
        settings: [
          bool('c.voiceEnabled', 'Enable voice input', 'Voice & input', true, 'Voice input is not supported in every browser.'),
          bool('c.autoTranscribe', 'Auto-transcribe voice into the draft', 'Voice & input', true),
          select('c.voiceLang', 'Voice input language', 'Voice & input', 'en-US', [{ value: 'en-US', label: 'English (US)' }, { value: 'en-GB', label: 'English (UK)' }, { value: 'es-ES', label: 'Español' }, { value: 'fr-FR', label: 'Français' }]),
          bool('c.voiceHotkey', 'Hold-to-talk hotkey', 'Voice & input', false),
        ],
      },
      {
        name: 'Messages',
        settings: [
          bool('c.timestamps', 'Show timestamps', 'Messages', true, 'Used for timestamps and schedules.'),
          bool('c.avatars', 'Show avatars', 'Messages', true),
          bool('c.toolStatus', 'Show tool status', 'Messages', true, 'Show progress labels for long-running tools.'),
          bool('c.streaming', 'Stream replies token-by-token', 'Messages', true),
          bool('c.markdown', 'Render Markdown in replies', 'Messages', true),
          bool('c.codeHighlight', 'Syntax-highlight code blocks', 'Messages', true),
          bool('c.copyButton', 'Show copy button on code', 'Messages', true),
          bool('c.wordWrap', 'Soft-wrap long lines', 'Messages', true),
          select('c.bubbleStyle', 'Bubble style', 'Messages', 'flat', [{ value: 'flat', label: 'Flat' }, { value: 'bordered', label: 'Bordered' }, { value: 'bubbly', label: 'Bubbly' }], 'Change message surface geometry.'),
          bool('c.readReceipts', 'Show delivery state', 'Messages', false),
        ],
      },
      {
        name: 'Behaviour',
        settings: [
          select('c.verbosity', 'Response verbosity', 'Behaviour', 'balanced', [{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }], 'Balanced and thoughtful.'),
          select('c.tone', 'Assistant tone', 'Behaviour', 'neutral', [{ value: 'neutral', label: 'Neutral' }, { value: 'friendly', label: 'Friendly' }, { value: 'formal', label: 'Formal' }, { value: 'playful', label: 'Playful' }]),
          bool('c.autoTitle', 'Auto-title conversations', 'Behaviour', true),
          bool('c.suggestFollowups', 'Suggest follow-up prompts', 'Behaviour', true),
          slider('c.contextWindow', 'Context memory (turns)', 'Behaviour', 30, 4, 100, 2),
          bool('c.hints', 'Show helpful hints', 'Behaviour', true, "Use Nova's contextual drafting suggestions."),
          bool('c.copyOnHover', 'Show copy button on hover', 'Behaviour', true, 'One-click copy response.'),
          bool('c.autoScroll', 'Auto-scroll to newest message', 'Behaviour', true),
          bool('c.confirmOnSend', 'Confirm before sending long drafts', 'Behaviour', false),
          slider('c.historyFetch', 'Messages loaded per chat', 'Behaviour', 50, 20, 200, 10),
        ],
      },
    ],
  },
  {
    id: 'projects',
    title: 'Projects & artifacts',
    blurb: 'Projects, attachments, and generated outputs.',
    groups: [
      {
        name: 'Projects',
        settings: [
          bool('p.autoCreate', 'Auto-create a project from long threads', 'Projects', false),
          bool('p.showCount', 'Show conversation count per project', 'Projects', true),
          select('p.defaultView', 'Default project view', 'Projects', 'grid', [{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]),
          select('p.sortOrder', 'Sort projects by', 'Projects', 'recent', [{ value: 'recent', label: 'Recent activity' }, { value: 'name', label: 'Name' }, { value: 'created', label: 'Date created' }]),
          slider('p.maxPinned', 'Max pinned projects', 'Projects', 6, 0, 20, 1),
        ],
      },
      {
        name: 'Artifacts',
        settings: [
          bool('p.autoOpen', 'Auto-open artifacts when created', 'Artifacts', true, 'Auto-open artifacts.'),
          bool('p.previews', 'Artifact previews', 'Artifacts', true, 'Show document and code previews.'),
          bool('p.thumbnails', 'Show thumbnails and metadata', 'Artifacts', true),
          select('p.exportFormat', 'Default export format', 'Artifacts', 'md', [{ value: 'md', label: 'Markdown' }, { value: 'txt', label: 'Plain text' }, { value: 'json', label: 'JSON' }, { value: 'html', label: 'HTML' }], 'Artifact exported.'),
          bool('p.saveCopies', 'Keep a copy of each artifact', 'Artifacts', true),
          slider('p.previewLines', 'Preview length', 'Artifacts', 6, 2, 30, 1, ' lines'),
        ],
      },
      {
        name: 'Attachments',
        settings: [
          bool('p.attachPreviews', 'Attachment previews', 'Attachments', true),
          bool('p.dragHint', 'Show drag-and-drop guidance', 'Attachments', true, 'Show drag-and-drop guidance beside Attach files.'),
          slider('p.maxAttachMb', 'Max attachment size', 'Attachments', 25, 1, 100, 1, ' MB'),
          bool('p.autoName', 'Auto-name attachments', 'Attachments', true),
          select('p.imageQuality', 'Image upload quality', 'Attachments', 'high', [{ value: 'original', label: 'Original' }, { value: 'high', label: 'High' }, { value: 'balanced', label: 'Balanced' }]),
        ],
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    blurb: 'Models, tools, performance, and developer controls.',
    groups: [
      {
        name: 'Model & reasoning',
        settings: [
          select('x.model', 'Preferred model', 'Model & reasoning', 'gpt-5-mini', [{ value: 'gpt-5-mini', label: 'GPT-5 mini' }, { value: 'gpt-5', label: 'GPT-5' }, { value: 'gpt-5.1', label: 'GPT-5.1' }, { value: 'gpt-5.2', label: 'GPT-5.2' }]),
          slider('x.temperature', 'Temperature', 'Model & reasoning', 50, 0, 100, 5, '', 'Creativity vs. determinism.'),
          slider('x.topP', 'Top-p (nucleus sampling)', 'Model & reasoning', 95, 0, 100, 5, '%'),
          slider('x.maxTokens', 'Max response tokens', 'Model & reasoning', 2048, 256, 8192, 256),
          slider('x.freqPenalty', 'Frequency penalty', 'Model & reasoning', 0, 0, 100, 5, '%'),
          slider('x.presPenalty', 'Presence penalty', 'Model & reasoning', 0, 0, 100, 5, '%'),
          select('x.reasoning', 'Reasoning effort', 'Model & reasoning', 'balanced', [{ value: 'low', label: 'Low' }, { value: 'balanced', label: 'Balanced' }, { value: 'high', label: 'High' }]),
          bool('x.chainOfThought', 'Show reasoning summary', 'Model & reasoning', false),
        ],
      },
      {
        name: 'System & tools',
        settings: [
          { id: 'x.systemPrompt', label: 'Custom system prompt', hint: 'Tell Nova how to work in this workspace.', type: 'text', def: '', group: 'System & tools' },
          bool('x.webSearch', 'Web search by default', 'System & tools', false, 'Allow current-information lookup.'),
          bool('x.toolsEnabled', 'Enable tool use in chat', 'System & tools', true),
          bool('x.confirmSensitive', 'Ask before high-impact operations', 'System & tools', true),
          select('x.toolMode', 'Tool execution mode', 'System & tools', 'auto', [{ value: 'auto', label: 'Automatic' }, { value: 'confirm', label: 'Confirm each' }, { value: 'off', label: 'Disabled' }]),
          bool('x.memoryRecall', 'Semantic memory recall (RAG)', 'System & tools', true),
          slider('x.memoryDepth', 'Memory recall depth', 'System & tools', 4, 0, 12, 1),
        ],
      },
      {
        name: 'Agents & workflows',
        settings: [
          bool('x.agentsEnabled', 'Enable multi-agent orchestration', 'Agents & workflows', true),
          slider('x.maxAgents', 'Max concurrent agents', 'Agents & workflows', 4, 1, 10, 1),
          bool('x.autoDelegate', 'Auto-delegate subtasks', 'Agents & workflows', true),
          bool('x.workflowCron', 'Run scheduled workflows', 'Agents & workflows', true),
          select('x.approvalMode', 'Approval workflow', 'Agents & workflows', 'review', [{ value: 'auto', label: 'Auto-approve safe' }, { value: 'review', label: 'Review risky' }, { value: 'manual', label: 'Approve all' }], 'Ask before high-impact operations.'),
          slider('x.jobRetries', 'Job retry attempts', 'Agents & workflows', 3, 0, 10, 1),
        ],
      },
      {
        name: 'Performance & developer',
        settings: [
          bool('x.prefetch', 'Prefetch likely next screens', 'Performance & developer', true),
          bool('x.caching', 'Cache API responses', 'Performance & developer', true),
          slider('x.cacheTtl', 'Cache TTL', 'Performance & developer', 300, 30, 3600, 30, 's'),
          slider('x.renderBudget', 'Render budget (messages)', 'Performance & developer', 200, 50, 1000, 50),
          bool('x.lazyLoad', 'Lazy-load long conversations', 'Performance & developer', true),
          bool('x.debugOverlay', 'Show debug overlay', 'Performance & developer', false),
          bool('x.devMode', 'Developer mode', 'Performance & developer', false),
          bool('x.verboseLogs', 'Verbose console logging', 'Performance & developer', false),
          slider('x.apiTimeout', 'API timeout', 'Performance & developer', 60, 5, 300, 5, 's'),
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & data',
    blurb: 'Data handling, analytics, and storage.',
    groups: [
      {
        name: 'Privacy',
        settings: [
          bool('d.analytics', 'Allow anonymous analytics', 'Privacy', false),
          bool('d.crashReports', 'Share crash reports', 'Privacy', true),
          bool('d.telemetry', 'Usage telemetry', 'Privacy', false),
          bool('d.history', 'Keep conversation history', 'Privacy', true),
          slider('d.retentionDays', 'History retention', 'Privacy', 90, 1, 365, 1, ' days'),
          bool('d.incognito', 'Incognito mode (don\'t save)', 'Privacy', false),
          bool('d.redactPii', 'Auto-redact PII from logs', 'Privacy', true),
        ],
      },
      {
        name: 'Security',
        settings: [
          bool('d.requireUnlock', 'Require workspace unlock', 'Security', false, 'Unlock the workspace to use sensitive tools.'),
          { id: 'd.workspacePass', label: 'Workspace password', hint: 'Unlock the workspace to use the sandbox.', type: 'text', def: '', group: 'Security' },
          slider('d.autoLockMin', 'Auto-lock after', 'Security', 15, 0, 120, 5, ' min', '0 = never.'),
          bool('d.maskSensitive', 'Mask sensitive values in UI', 'Security', true),
          bool('d.sessionLock', 'Lock on tab hide', 'Security', false),
          bool('d.httpsOnly', 'Block insecure (HTTP) content', 'Security', true),
          bool('d.thirdPartyBlock', 'Block third-party trackers', 'Security', true),
        ],
      },
      {
        name: 'Data management',
        settings: [
          bool('d.autoBackup', 'Automatic local backup', 'Data management', true),
          select('d.backupFreq', 'Backup frequency', 'Data management', 'daily', [{ value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]),
          bool('d.exportIncludeMedia', 'Include media in exports', 'Data management', true),
          slider('d.storageCapMb', 'Local storage cap', 'Data management', 512, 64, 4096, 64, ' MB'),
          select('d.clearOnExit', 'On exit', 'Data management', 'keep', [{ value: 'keep', label: 'Keep everything' }, { value: 'cache', label: 'Clear cache only' }, { value: 'all', label: 'Clear all data' }]),
          bool('d.compressStorage', 'Compress stored data', 'Data management', true),
          bool('d.encryptLocal', 'Encrypt local workspace data', 'Data management', false),
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications & sounds',
    blurb: 'Alerts, sounds, and task completion cues.',
    groups: [
      {
        name: 'Notifications',
        settings: [
          bool('n.enabled', 'Enable notifications', 'Notifications', true),
          bool('n.taskComplete', 'Task completion alerts', 'Notifications', true),
          bool('n.mentions', 'Mention & reply alerts', 'Notifications', true),
          bool('n.workflow', 'Workflow run alerts', 'Notifications', true),
          bool('n.errors', 'Error & failure alerts', 'Notifications', true),
          select('n.position', 'Notification position', 'Notifications', 'bottom', [{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'top-right', label: 'Top right' }, { value: 'bottom-right', label: 'Bottom right' }]),
          slider('n.duration', 'Notification duration', 'Notifications', 4, 1, 15, 1, 's'),
          bool('n.doNotDisturb', 'Do not disturb', 'Notifications', false),
          select('n.dndSchedule', 'DND schedule', 'Notifications', 'off', [{ value: 'off', label: 'Off' }, { value: 'night', label: 'Nights' }, { value: 'custom', label: 'Custom hours' }]),
        ],
      },
      {
        name: 'Sounds',
        settings: [
          bool('n.sounds', 'Interface sounds', 'Sounds', true, 'Use quiet interface sounds.'),
          select('n.soundPack', 'Sound pack', 'Sounds', 'soft', [{ value: 'soft', label: 'Soft' }, { value: 'classic', label: 'Classic' }, { value: 'minimal', label: 'Minimal' }, { value: 'none', label: 'None' }]),
          slider('n.volume', 'Sound volume', 'Sounds', 50, 0, 100, 5, '%'),
          bool('n.sendSound', 'Play sound on send', 'Sounds', true),
          bool('n.receiveSound', 'Play sound on reply', 'Sounds', true),
          bool('n.haptics', 'Haptic feedback (mobile)', 'Sounds', true),
        ],
      },
      {
        name: 'Badges & indicators',
        settings: [
          bool('n.unreadBadge', 'Show unread count badge', 'Badges & indicators', true),
          bool('n.typingIndicator', 'Show typing indicator', 'Badges & indicators', true),
          bool('n.statusDot', 'Show active-status dot', 'Badges & indicators', true),
          bool('n.previewSnippet', 'Show message preview in list', 'Badges & indicators', true),
        ],
      },
    ],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    blurb: 'Contrast, focus, and assistive-reading controls.',
    groups: [
      {
        name: 'Vision',
        settings: [
          bool('y.highContrast', 'High-contrast mode', 'Vision', false),
          select('y.contrastLevel', 'Contrast level', 'Vision', 'normal', [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'highest', label: 'Highest' }]),
          bool('y.largeText', 'Larger text', 'Vision', false),
          bool('y.boldText', 'Bolder text', 'Vision', false),
          bool('y.colorBlindSafe', 'Colour-blind safe palette', 'Vision', false),
          select('y.colorBlindType', 'Colour-blind profile', 'Vision', 'none', [{ value: 'none', label: 'None' }, { value: 'protanopia', label: 'Protanopia' }, { value: 'deuteranopia', label: 'Deuteranopia' }, { value: 'tritanopia', label: 'Tritanopia' }]),
          bool('y.underlineLinks', 'Always underline links', 'Vision', true),
          slider('y.textSpacing', 'Extra text spacing', 'Vision', 0, 0, 50, 5, '%'),
        ],
      },
      {
        name: 'Motion & focus',
        settings: [
          bool('y.reduceMotionA11y', 'Reduce motion', 'Motion & focus', false),
          bool('y.reduceTransparency', 'Reduce transparency', 'Motion & focus', false),
          bool('y.focusOutline', 'Always show focus outline', 'Motion & focus', true),
          slider('y.focusWidth', 'Focus outline width', 'Motion & focus', 2, 1, 6, 1, 'px'),
          bool('y.screenReaderHints', 'Extra screen-reader hints', 'Motion & focus', false),
          bool('y.autoRead', 'Read replies aloud automatically', 'Motion & focus', false),
          select('y.readSpeed', 'Read-aloud speed', 'Motion & focus', '1', [{ value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '1.5', label: '1.5×' }, { value: '2', label: '2×' }]),
        ],
      },
      {
        name: 'Input & navigation',
        settings: [
          bool('y.keyboardNav', 'Full keyboard navigation', 'Input & navigation', true),
          bool('y.stickyComposer', 'Keep composer visible while scrolling', 'Input & navigation', true),
          slider('y.tapTarget', 'Minimum tap-target size', 'Input & navigation', 44, 32, 64, 2, 'px'),
          bool('y.doubleTapEdit', 'Double-tap to edit message', 'Input & navigation', false),
          select('y.scrollBehaviour', 'Scroll behaviour', 'Input & navigation', 'smooth', [{ value: 'smooth', label: 'Smooth' }, { value: 'instant', label: 'Instant' }]),
        ],
      },
    ],
  },
]

export type SettingsValues = Record<string, unknown>

export function defaultValues(): SettingsValues {
  const out: SettingsValues = {}
  for (const cat of CATEGORIES) for (const grp of cat.groups) for (const s of grp.settings) out[s.id] = s.def
  return out
}

export function loadSettings(): SettingsValues {
  try {
    const raw = localStorage.getItem('nova.settings')
    if (raw) return { ...defaultValues(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaultValues()
}

export function saveSettings(values: SettingsValues) {
  localStorage.setItem('nova.settings', JSON.stringify(values))
}

export function countSettings(): number {
  return CATEGORIES.reduce((n, cat) => n + cat.groups.reduce((m, g) => m + g.settings.length, 0), 0)
}
