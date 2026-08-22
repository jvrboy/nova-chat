import type { ToolDefinition } from './runtime';

// Pure on-device utilities. No network, no storage side effects — they run
// instantly in the Toolbox screen, from chat slash commands, and through the
// approval-gated agent runtime even when the app is fully offline.

const ARITH_TOKEN = /\s*(\d+\.?\d*|\*\*|[-+*/%()])/y;
function evaluateArithmetic(expression: string): number {
  let pos = 0;
  const peek = () => { ARITH_TOKEN.lastIndex = pos; const match = ARITH_TOKEN.exec(expression); return match ? match[1] : null; };
  const next = () => { const token = peek(); if (token === null) throw new Error(`Unexpected end of expression at position ${pos}.`); pos = ARITH_TOKEN.lastIndex; return token; };
  const parsePrimary = (): number => {
    const token = next();
    if (token === '(') { const value = parseAdditive(); if (next() !== ')') throw new Error('Missing closing parenthesis.'); return value; }
    if (token === '-') return -parsePrimary();
    if (token === '+') return parsePrimary();
    if (/^\d/.test(token)) return Number(token);
    throw new Error(`Unexpected token "${token}".`);
  };
  const parsePower = (): number => { const base = parsePrimary(); if (peek() === '**') { next(); return base ** parsePower(); } return base; };
  const parseMultiplicative = (): number => { let value = parsePower(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = next(); const rhs = parsePower(); value = op === '*' ? value * rhs : op === '/' ? value / rhs : value % rhs; } return value; };
  const parseAdditive = (): number => { let value = parseMultiplicative(); while (peek() === '+' || peek() === '-') { const op = next(); const rhs = parseMultiplicative(); value = op === '+' ? value + rhs : value - rhs; } return value; };
  const result = parseAdditive();
  if (peek() !== null) throw new Error(`Unexpected token at position ${pos}.`);
  if (!Number.isFinite(result)) throw new Error('Expression did not evaluate to a finite number.');
  return result;
}

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const sentencesOf = (text: string) => text.split(/[.!?]+\s|[.!?]+$/).map((s) => s.trim()).filter(Boolean);
const toWords = (text: string) => text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
const toBase64 = (text: string) => { const bytes = new TextEncoder().encode(text); let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); };
const fromBase64 = (value: string) => { const binary = atob(value.replace(/\s+/g, '')); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); return new TextDecoder().decode(bytes); };
const randomInt = (max: number) => Math.floor(Math.random() * max);

export const utilityTools: ToolDefinition[] = [
  {
    id: 'calculator', name: 'Calculator', description: 'Evaluate an arithmetic expression safely (+, -, *, /, %, parentheses, ** powers) without executing arbitrary code.', risk: 'safe', input: 'text',
    run: async (input) => { const expression = input.trim().replace(/[,_]/g, ''); if (!expression) throw new Error('Provide an arithmetic expression, e.g. (2 + 3) * 7.'); return `${expression} = ${evaluateArithmetic(expression)}`; },
  },
  {
    id: 'word-count', name: 'Text Metrics', description: 'Count words, characters, sentences, and estimated reading time for a draft.', risk: 'safe', input: 'text',
    run: async (input) => { const words = wordsOf(input); const sentences = sentencesOf(input); const readingMinutes = Math.max(1, Math.round(words.length / 200)); return JSON.stringify({ characters: input.length, charactersNoSpaces: input.replace(/\s/g, '').length, words: words.length, sentences: sentences.length, paragraphs: input.split(/\n{2,}/).filter((p) => p.trim()).length, readingMinutes }, null, 2); },
  },
  {
    id: 'case-convert', name: 'Case Converter', description: 'Convert text between UPPER, lower, Title, camelCase, PascalCase, snake_case, and kebab-case. Input format: "style | text".', risk: 'safe', input: 'text',
    run: async (input) => { const separator = input.includes('|') ? '|' : '\n'; const [rawStyle, ...rest] = input.split(separator); const style = rawStyle.trim().toLowerCase(); const text = rest.join(separator).trim() || rawStyle.trim(); if (!text) throw new Error('Provide "style | text", e.g. "camel | hello world".'); const parts = toWords(text).map((w) => w.toLowerCase()); const map: Record<string, () => string> = { upper: () => text.toUpperCase(), uppercase: () => text.toUpperCase(), lower: () => text.toLowerCase(), lowercase: () => text.toLowerCase(), title: () => parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), camel: () => parts.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join(''), pascal: () => parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(''), snake: () => parts.join('_'), kebab: () => parts.join('-') }; const convert = map[style] ?? map[style.replace('-', '')]; if (!convert) throw new Error(`Unknown style "${style}". Use upper, lower, title, camel, pascal, snake, or kebab.`); return convert(); },
  },
  {
    id: 'slugify', name: 'Slugify', description: 'Turn any title into a clean URL-safe slug with a configurable separator.', risk: 'safe', input: 'text',
    run: async (input) => { const [sep, ...rest] = input.includes('|') ? input.split('|') : ['-', input]; const slug = rest.join('|').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, sep.trim() || '-').replace(new RegExp(`^\\${(sep.trim() || '-')}+|\\${(sep.trim() || '-')}+$`, 'g'), ''); return slug || 'empty-slug'; },
  },
  {
    id: 'base64-codec', name: 'Base64 Codec', description: 'Encode or decode Base64 text. Input format: "encode|decode | text".', risk: 'safe', input: 'text',
    run: async (input) => { const mode = /^decode/i.test(input.trim()) ? 'decode' : 'encode'; const payload = input.replace(/^\s*(encode|decode)\s*\|?\s*/i, ''); if (!payload.trim()) throw new Error('Provide text to encode or decode.'); try { return mode === 'encode' ? toBase64(payload) : fromBase64(payload); } catch { throw new Error('Input is not valid Base64.'); } },
  },
  {
    id: 'url-codec', name: 'URL Codec', description: 'Percent-encode or decode a URL/component, and parse a URL into its parts. Input format: "encode|decode|parse | text".', risk: 'safe', input: 'text',
    run: async (input) => { const mode = /^\s*(encode|decode|parse)/i.test(input) ? (/^\s*decode/i.test(input) ? 'decode' : /^\s*parse/i.test(input) ? 'parse' : 'encode') : 'parse'; const payload = input.replace(/^\s*(encode|decode|parse)\s*\|?\s*/i, ''); if (mode === 'parse') { const url = new URL(payload.trim()); return JSON.stringify({ href: url.href, protocol: url.protocol, host: url.host, pathname: url.pathname, search: url.search, hash: url.hash, origin: url.origin, params: Object.fromEntries(url.searchParams.entries()) }, null, 2); } return mode === 'encode' ? encodeURIComponent(payload) : decodeURIComponent(payload.replace(/\+/g, ' ')); },
  },
  {
    id: 'uuid-generate', name: 'UUID Generator', description: 'Generate random UUID v4 identifiers locally. Input: optional count (default 1).', risk: 'safe', input: 'text',
    run: async (input) => { const count = Math.min(Math.max(Number(input.trim()) || 1, 1), 50); const uuid = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ randomInt(16) >> Number(c) / 4).toString(16)); return Array.from({ length: count }, uuid).join('\n'); },
  },
  {
    id: 'password-generate', name: 'Password Generator', description: 'Generate a strong random password locally. Input: optional "length symbols?" e.g. "20 yes". Nothing is stored or transmitted.', risk: 'safe', input: 'text',
    run: async (input) => { const [lengthRaw, symbolsRaw] = input.toLowerCase().trim().split(/\s+/); const length = Math.min(Math.max(Number(lengthRaw) || 20, 8), 128); const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' + (symbolsRaw === 'yes' || symbolsRaw === 'true' ? '!@#$%^&*-_=+?' : ''); let password = ''; for (let i = 0; i < length; i++) password += alphabet[randomInt(alphabet.length)]; return password; },
  },
  {
    id: 'json-format', name: 'JSON Formatter', description: 'Validate, pretty-print, or minify JSON. Input: JSON text, optionally prefixed with "minify | ".', risk: 'safe', input: 'json',
    run: async (input) => { const minify = /^\s*minify\s*\|/i.test(input); const payload = input.replace(/^\s*minify\s*\|\s*/i, ''); const parsed = JSON.parse(payload) as unknown; return minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2); },
  },
  {
    id: 'regex-test', name: 'Regex Tester', description: 'Test a regular expression against text safely. Input format: "pattern | flags | text" (flags default "g").', risk: 'safe', input: 'text',
    run: async (input) => { const sections = input.split('|').map((part) => part.trim()); if (sections.length < 2) throw new Error('Use "pattern | text" or "pattern | flags | text".'); const pattern = sections[0]; const flags = sections.length > 2 ? sections[1] : 'g'; const text = sections.slice(sections.length > 2 ? 2 : 1).join('|'); let regex: RegExp; try { regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`); } catch { throw new Error('Invalid regular expression.'); } const matches = [...text.matchAll(regex)].slice(0, 100).map((m) => ({ match: m[0], index: m.index, groups: m.slice(1) })); return JSON.stringify({ matches, count: matches.length }, null, 2); },
  },
  {
    id: 'timestamp-convert', name: 'Timestamp Converter', description: 'Convert between Unix timestamps (seconds or milliseconds) and ISO dates in both directions. Input: a unix number or ISO string.', risk: 'safe', input: 'text',
    run: async (input) => { const value = input.trim(); if (/^\d{10}$/.test(value) || /^\d{13}$/.test(value)) { const ms = value.length === 10 ? Number(value) * 1000 : Number(value); return JSON.stringify({ iso: new Date(ms).toISOString(), unixSeconds: Math.floor(ms / 1000), unixMillis: ms, utc: new Date(ms).toUTCString() }, null, 2); } const date = new Date(value); if (Number.isNaN(date.getTime())) throw new Error('Provide a unix timestamp (10 or 13 digits) or a parsable date string.'); return JSON.stringify({ iso: date.toISOString(), unixSeconds: Math.floor(date.getTime() / 1000), unixMillis: date.getTime(), relativeMs: date.getTime() - Date.now() }, null, 2); },
  },
  {
    id: 'number-base', name: 'Number Base Converter', description: 'Convert numbers between bases (2-36). Input format: "binary hex octal decimal | number" e.g. "hex dec | ff".', risk: 'safe', input: 'text',
    run: async (input) => { const aliases: Record<string, number> = { bin: 2, binary: 2, oct: 8, octal: 8, dec: 10, decimal: 10, hex: 16, hexadecimal: 16, base32: 32, base36: 36 }; const sections = input.split('|').map((part) => part.trim()); const fromKey = (sections[0] || '').toLowerCase(); const value = sections[1] ?? ''; if (!fromKey || !aliases[fromKey] || !value) throw new Error('Use "from | value", e.g. "hex | ff" (bin, octal, dec, hex, base36).'); const parsed = parseInt(value.replace(/^0[box]/i, ''), aliases[fromKey]); if (Number.isNaN(parsed)) throw new Error(`"${value}" is not a valid base-${aliases[fromKey]} number.`); return JSON.stringify({ binary: parsed.toString(2), octal: parsed.toString(8), decimal: parsed.toString(10), hex: parsed.toString(16), base36: parsed.toString(36) }, null, 2); },
  },
  {
    id: 'color-convert', name: 'Color Converter', description: 'Convert colors between HEX and RGB/HSL. Input: a hex (#22d3ee) or rgb(...) color string.', risk: 'safe', input: 'text',
    run: async (input) => { const value = input.trim(); const rgbFromHex = /^#?([0-9a-f]{6})$/i.exec(value.replace('#', '').length === 3 ? `#${value.replace('#', '').split('').map((c) => c + c).join('')}` : value); let r: number; let g: number; let b: number; if (rgbFromHex) { const int = parseInt(rgbFromHex[1], 16); r = (int >> 16) & 255; g = (int >> 8) & 255; b = int & 255; } else { const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value); if (!m) throw new Error('Provide a #rrggbb or rgb(r,g,b) color.'); r = Number(m[1]); g = Number(m[2]); b = Number(m[3]); } if ([r, g, b].some((v) => v > 255)) throw new Error('RGB channels must be 0-255.'); const rf = r / 255; const gf = g / 255; const bf = b / 255; const maxC = Math.max(rf, gf, bf); const minC = Math.min(rf, gf, bf); const l = (maxC + minC) / 2; const d = maxC - minC; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); let h = 0; if (d !== 0) { if (maxC === rf) h = ((gf - bf) / d) % 6; else if (maxC === gf) h = (bf - rf) / d + 2; else h = (rf - gf) / d + 4; h *= 60; if (h < 0) h += 360; } const hexOut = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`; return JSON.stringify({ hex: hexOut, rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`, luminance: Number((0.2126 * rf + 0.7152 * gf + 0.0722 * bf).toFixed(4)) }, null, 2); },
  },
  {
    id: 'lorem-ipsum', name: 'Lorem Ipsum Generator', description: 'Generate placeholder text. Input: optional "paragraphs words?" e.g. "3 60".', risk: 'safe', input: 'text',
    run: async (input) => { const [paragraphsRaw, wordsRaw] = input.trim().split(/\s+/); const paragraphCount = Math.min(Math.max(Number(paragraphsRaw) || 3, 1), 10); const wordsPerParagraph = Math.min(Math.max(Number(wordsRaw) || 45, 10), 120); const corpus = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' '); const sentence = () => { const length = 8 + randomInt(12); const parts = Array.from({ length }, () => corpus[randomInt(corpus.length)]); return parts[0][0].toUpperCase() + parts[0].slice(1) + parts.slice(1).join(' ') + '.'; }; return Array.from({ length: paragraphCount }, () => { const out: string[] = []; let count = 0; while (count < wordsPerParagraph) { const s = sentence(); count += wordsOf(s).length; out.push(s); } return out.join(' '); }).join('\n\n'); },
  },
];
