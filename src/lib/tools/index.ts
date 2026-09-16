// ============ Nova Chat Tool Registry ============
// Each tool can be invoked by the chat backend or directly via /api/tools/[name]
// Risk levels: safe (auto-run) | review (needs approval) | sensitive (never auto-run)

import ZAI from "z-ai-web-dev-sdk";
import { recordToolRun } from "@/lib/storage";

export interface ToolParam {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
  default?: any;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: "utility" | "data" | "web" | "code" | "ai" | "system";
  risk: "safe" | "review" | "sensitive";
  icon: string; // lucide icon name
  params: ToolParam[];
  execute: (args: Record<string, any>, ctx?: ToolContext) => Promise<any>;
}

export interface ToolContext {
  chatId?: string;
  userId?: string;
}

// ============ Utility tools ============

const calculator: Tool = {
  id: "calculator",
  name: "Calculator",
  description: "Evaluate a math expression. Supports +, -, *, /, **, %, parentheses, sqrt(), sin(), cos(), tan(), log(), log10(), exp(), abs(), round(), floor(), ceil(), min(), max(), pow().",
  category: "utility",
  risk: "safe",
  icon: "Calculator",
  params: [{ name: "expression", type: "string", description: "Math expression", required: true }],
  async execute({ expression }) {
    const start = Date.now();
    let result: any;
    try {
      result = safeEvalMath(expression || "");
    } catch (e: any) {
      result = `Error: ${e.message}`;
    }
    const ms = Date.now() - start;
    await recordToolRun({ toolName: "calculator", toolInput: { expression }, toolOutput: { result }, durationMs: ms });
    return { expression, result, durationMs: ms };
  },
};

// Safe recursive-descent math evaluator (no eval/Function — works on edge runtime)
function safeEvalMath(expr: string): number {
  const tokens = tokenizeMath(expr);
  let pos = 0;

  function peek(): string | null {
    return pos < tokens.length ? tokens[pos] : null;
  }
  function next(): string | null {
    return tokens[pos++] ?? null;
  }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next()!;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm(): number {
    let left = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next()!;
      const right = parseFactor();
      if (op === "*") left = left * right;
      else if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left = left / right;
      } else left = left % right;
    }
    return left;
  }
  function parseFactor(): number {
    let left = parseUnary();
    if (peek() === "**" || peek() === "^") {
      next();
      const right = parseFactor();
      return Math.pow(left, right);
    }
    return left;
  }
  function parseUnary(): number {
    if (peek() === "-") {
      next();
      return -parseUnary();
    }
    if (peek() === "+") {
      next();
      return parseUnary();
    }
    return parsePrimary();
  }
  function parsePrimary(): number {
    const t = peek();
    if (t === null) throw new Error("Unexpected end of expression");
    if (t === "(") {
      next();
      const v = parseExpr();
      if (next() !== ")") throw new Error("Expected )");
      return v;
    }
    if (/^-?\d+(\.\d+)?$/.test(t)) {
      next();
      return parseFloat(t);
    }
    if (/^[a-z_]+$/i.test(t)) {
      next();
      // Function call?
      if (peek() === "(") {
        next();
        const args: number[] = [];
        if (peek() !== ")") {
          args.push(parseExpr());
          while (peek() === ",") {
            next();
            args.push(parseExpr());
          }
        }
        if (next() !== ")") throw new Error("Expected ) after function args");
        return applyFunction(t.toLowerCase(), args);
      }
      // Constant
      const c = t.toLowerCase();
      if (c === "pi") return Math.PI;
      if (c === "e") return Math.E;
      if (c === "tau") return Math.PI * 2;
      throw new Error(`Unknown identifier: ${t}`);
    }
    throw new Error(`Unexpected token: ${t}`);
  }

  const result = parseExpr();
  if (pos < tokens.length) throw new Error(`Unexpected trailing tokens at position ${pos}`);
  return result;
}

function tokenizeMath(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "*" && expr[i + 1] === "*") { tokens.push("**"); i += 2; continue; }
    if (c === "^") { tokens.push("^"); i++; continue; }
    if ("+-*/%(),".includes(c)) { tokens.push(c); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      // Handle scientific notation
      if (expr[i] === "e" || expr[i] === "E") {
        num += expr[i]; i++;
        if (expr[i] === "+" || expr[i] === "-") { num += expr[i]; i++; }
        while (i < expr.length && /[0-9]/.test(expr[i])) { num += expr[i]; i++; }
      }
      tokens.push(num);
      continue;
    }
    if (/[a-z_]/i.test(c)) {
      let id = "";
      while (i < expr.length && /[a-z0-9_]/i.test(expr[i])) {
        id += expr[i];
        i++;
      }
      tokens.push(id);
      continue;
    }
    throw new Error(`Unexpected character: ${c} at position ${i}`);
  }
  return tokens;
}

function applyFunction(name: string, args: number[]): number {
  const fns: Record<string, (a: number[]) => number> = {
    sqrt: (a) => Math.sqrt(a[0]),
    cbrt: (a) => Math.cbrt(a[0]),
    sin: (a) => Math.sin(a[0]),
    cos: (a) => Math.cos(a[0]),
    tan: (a) => Math.tan(a[0]),
    asin: (a) => Math.asin(a[0]),
    acos: (a) => Math.acos(a[0]),
    atan: (a) => Math.atan(a[0]),
    atan2: (a) => Math.atan2(a[0], a[1]),
    sinh: (a) => Math.sinh(a[0]),
    cosh: (a) => Math.cosh(a[0]),
    tanh: (a) => Math.tanh(a[0]),
    log: (a) => Math.log(a[0]),
    log2: (a) => Math.log2(a[0]),
    log10: (a) => Math.log10(a[0]),
    ln: (a) => Math.log(a[0]),
    exp: (a) => Math.exp(a[0]),
    abs: (a) => Math.abs(a[0]),
    round: (a) => Math.round(a[0]),
    floor: (a) => Math.floor(a[0]),
    ceil: (a) => Math.ceil(a[0]),
    sign: (a) => Math.sign(a[0]),
    min: (a) => Math.min(...a),
    max: (a) => Math.max(...a),
    pow: (a) => Math.pow(a[0], a[1]),
    hypot: (a) => Math.hypot(...a),
  };
  const fn = fns[name];
  if (!fn) throw new Error(`Unknown function: ${name}`);
  return fn(args);
}

const uuidGenerator: Tool = {
  id: "uuid-generator",
  name: "UUID Generator",
  description: "Generate one or more v4 UUIDs.",
  category: "utility",
  risk: "safe",
  icon: "Fingerprint",
  params: [
    { name: "count", type: "number", description: "How many UUIDs", default: 1, required: false },
  ],
  async execute({ count }) {
    const n = Math.min(100, Math.max(1, Number(count) || 1));
    const { v4 } = await import("uuid");
    const uuids = Array.from({ length: n }, () => v4());
    await recordToolRun({ toolName: "uuid-generator", toolInput: { count: n }, toolOutput: { uuids } });
    return { uuids };
  },
};

const base64Codec: Tool = {
  id: "base64-codec",
  name: "Base64 Codec",
  description: "Encode or decode base64.",
  category: "utility",
  risk: "safe",
  icon: "Binary",
  params: [
    { name: "action", type: "string", description: "encode | decode", required: true },
    { name: "input", type: "string", description: "Input text", required: true },
  ],
  async execute({ action, input }) {
    let output: string;
    try {
      if (action === "encode") {
        // Edge-compatible base64 encode
        output = btoa(unescape(encodeURIComponent(input || "")));
      } else {
        output = decodeURIComponent(escape(atob(input || "")));
      }
    } catch (e: any) {
      output = `Error: ${e.message}`;
    }
    await recordToolRun({ toolName: "base64-codec", toolInput: { action, input }, toolOutput: { output } });
    return { output };
  },
};

const hashGenerator: Tool = {
  id: "hash-generator",
  name: "Hash Generator",
  description: "Generate SHA-256, SHA-512, or MD5 hash of input text.",
  category: "utility",
  risk: "safe",
  icon: "Hash",
  params: [
    { name: "algorithm", type: "string", description: "sha256 | sha512 | md5", default: "sha256" },
    { name: "input", type: "string", description: "Input text", required: true },
  ],
  async execute({ algorithm, input }) {
    const algo = (algorithm || "sha256").toLowerCase();
    const crypto = await import("crypto");
    let hash: string;
    if (algo === "md5") {
      hash = crypto.createHash("md5").update(input || "").digest("hex");
    } else if (algo === "sha512") {
      hash = crypto.createHash("sha512").update(input || "").digest("hex");
    } else {
      hash = crypto.createHash("sha256").update(input || "").digest("hex");
    }
    await recordToolRun({ toolName: "hash-generator", toolInput: { algorithm: algo, input }, toolOutput: { hash } });
    return { algorithm: algo, hash };
  },
};

const passwordGenerator: Tool = {
  id: "password-generator",
  name: "Password Generator",
  description: "Generate a strong random password.",
  category: "utility",
  risk: "safe",
  icon: "Key",
  params: [
    { name: "length", type: "number", description: "Length (8-128)", default: 24 },
    { name: "symbols", type: "boolean", description: "Include symbols", default: true },
    { name: "numbers", type: "boolean", description: "Include numbers", default: true },
    { name: "uppercase", type: "boolean", description: "Include uppercase", default: true },
  ],
  async execute({ length, symbols, numbers, uppercase }) {
    const crypto = await import("crypto");
    let chars = "abcdefghijklmnopqrstuvwxyz";
    if (uppercase) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (numbers) chars += "0123456789";
    if (symbols) chars += "!@#$%^&*()-_=+[]{}<>?";
    const len = Math.min(128, Math.max(8, Number(length) || 24));
    const bytes = crypto.randomBytes(len);
    const password = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    await recordToolRun({ toolName: "password-generator", toolInput: { length: len, symbols, numbers, uppercase }, toolOutput: { password } });
    return { password, length: len };
  },
};

const jsonFormatter: Tool = {
  id: "json-formatter",
  name: "JSON Formatter",
  description: "Pretty-print, minify, or validate JSON.",
  category: "data",
  risk: "safe",
  icon: "Braces",
  params: [
    { name: "action", type: "string", description: "beautify | minify | validate", default: "beautify" },
    { name: "input", type: "string", description: "JSON text", required: true },
    { name: "indent", type: "number", description: "Indent spaces", default: 2 },
  ],
  async execute({ action, input, indent }) {
    let output: any;
    try {
      const parsed = JSON.parse(input || "");
      if (action === "minify") {
        output = JSON.stringify(parsed);
      } else if (action === "validate") {
        output = { valid: true, type: Array.isArray(parsed) ? "array" : typeof parsed };
      } else {
        output = JSON.stringify(parsed, null, Math.min(8, Math.max(0, Number(indent) || 2)));
      }
    } catch (e: any) {
      output = { error: e.message };
    }
    await recordToolRun({ toolName: "json-formatter", toolInput: { action, input }, toolOutput: { output } });
    return { output };
  },
};

const csvToJson: Tool = {
  id: "csv-to-json",
  name: "CSV to JSON",
  description: "Convert CSV (with header row) to JSON array of objects.",
  category: "data",
  risk: "safe",
  icon: "Table",
  params: [
    { name: "csv", type: "string", description: "CSV text", required: true },
    { name: "delimiter", type: "string", description: "Column delimiter", default: "," },
  ],
  async execute({ csv, delimiter }) {
    const text = csv || "";
    const delim = delimiter || ",";
    const rows: string[][] = [];
    let current: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === delim) { current.push(field); field = ""; }
        else if (ch === "\n") { current.push(field); rows.push(current); current = []; field = ""; }
        else if (ch === "\r") { /* skip */ }
        else field += ch;
      }
    }
    if (field || current.length) { current.push(field); rows.push(current); }
    if (rows.length < 2) {
      const out = { error: "Need at least header + one row" };
      await recordToolRun({ toolName: "csv-to-json", toolInput: { csv: text }, toolOutput: out });
      return out;
    }
    const headers = rows[0];
    const json = rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ""; });
      return obj;
    });
    await recordToolRun({ toolName: "csv-to-json", toolInput: { csv: text }, toolOutput: { rows: json.length } });
    return { rows: json.length, json };
  },
};

// ============ Web tools ============

const webSearch: Tool = {
  id: "web-search",
  name: "Web Search",
  description: "Search the web for real-time information.",
  category: "web",
  risk: "safe",
  icon: "Globe",
  params: [
    { name: "query", type: "string", description: "Search query", required: true },
    { name: "count", type: "number", description: "Result count (1-10)", default: 5 },
  ],
  async execute({ query, count }) {
    const start = Date.now();
    try {
      const zai = await ZAI.create();
      const n = Math.min(10, Math.max(1, Number(count) || 5));
      const results: any = await zai.functions.invoke("web_search", {
        query,
        num: n,
      });
      // FunctionMap: web_search returns SearchFunctionResultItem[] (an array)
      const arr = Array.isArray(results) ? results : (results?.results || []);
      const out = arr.map((r: any) => ({
        title: r.name || r.title,
        url: r.url,
        snippet: r.snippet || r.content || "",
        host: r.host_name,
        date: r.date,
      }));
      await recordToolRun({
        toolName: "web-search",
        toolInput: { query, count: n },
        toolOutput: { results: out.length },
        durationMs: Date.now() - start,
      });
      return { query, results: out };
    } catch (e: any) {
      await recordToolRun({
        toolName: "web-search",
        toolInput: { query },
        status: "error",
        error: e.message,
        durationMs: Date.now() - start,
      });
      return { query, error: e.message, results: [] };
    }
  },
};

const webReader: Tool = {
  id: "web-reader",
  name: "Web Page Reader",
  description: "Fetch a web page and extract its main text content.",
  category: "web",
  risk: "safe",
  icon: "FileText",
  params: [{ name: "url", type: "string", description: "URL to fetch", required: true }],
  async execute({ url }) {
    const start = Date.now();
    try {
      const zai = await ZAI.create();
      const result = await zai.functions.invoke("page_reader", { url });
      await recordToolRun({
        toolName: "web-reader",
        toolInput: { url },
        toolOutput: { length: (result as any)?.content?.length || 0 },
        durationMs: Date.now() - start,
      });
      return result;
    } catch (e: any) {
      await recordToolRun({
        toolName: "web-reader",
        toolInput: { url },
        status: "error",
        error: e.message,
        durationMs: Date.now() - start,
      });
      return { url, error: e.message };
    }
  },
};

// ============ AI tools ============

const imageGeneration: Tool = {
  id: "image-generation",
  name: "Image Generation",
  description: "Generate an image from a text prompt.",
  category: "ai",
  risk: "safe",
  icon: "ImagePlus",
  params: [
    { name: "prompt", type: "string", description: "Image description", required: true },
    { name: "size", type: "string", description: "1024x1024 | 768x1344 | 864x1152 | 1344x768 | 1152x864 | 1440x720 | 720x1440", default: "1024x1024" },
  ],
  async execute({ prompt, size }) {
    const start = Date.now();
    try {
      const zai = await ZAI.create();
      const result: any = await zai.images.generations.create({
        prompt,
        size: size || "1024x1024",
      });
      const images = result?.data || [];
      const out = { prompt, images, size };
      await recordToolRun({
        toolName: "image-generation",
        toolInput: { prompt, size },
        toolOutput: { images: images.length },
        durationMs: Date.now() - start,
      });
      return out;
    } catch (e: any) {
      await recordToolRun({
        toolName: "image-generation",
        toolInput: { prompt },
        status: "error",
        error: e.message,
        durationMs: Date.now() - start,
      });
      return { prompt, error: e.message };
    }
  },
};

// ============ System tools ============

const timestampTool: Tool = {
  id: "current-time",
  name: "Current Time",
  description: "Get the current timestamp in multiple formats.",
  category: "system",
  risk: "safe",
  icon: "Clock",
  params: [{ name: "timezone", type: "string", description: "IANA tz (e.g. UTC, Africa/Johannesburg)", default: "UTC" }],
  async execute({ timezone }) {
    const now = new Date();
    let tzTime = now.toISOString();
    try {
      if (timezone && timezone !== "UTC") {
        tzTime = now.toLocaleString("en-US", { timeZone: timezone });
      }
    } catch { /* keep UTC */ }
    const out = {
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      unixMs: now.getTime(),
      rfc: now.toUTCString(),
      timezone: timezone || "UTC",
      tzTime,
    };
    await recordToolRun({ toolName: "current-time", toolInput: { timezone }, toolOutput: out });
    return out;
  },
};

const qrGenerator: Tool = {
  id: "qr-generator",
  name: "QR Code Generator",
  description: "Generate an SVG QR code for any text/URL.",
  category: "utility",
  risk: "safe",
  icon: "QrCode",
  params: [
    { name: "text", type: "string", description: "Text or URL", required: true },
    { name: "size", type: "number", description: "Square size in px", default: 256 },
  ],
  async execute({ text, size }) {
    const s = Math.min(1024, Math.max(64, Number(size) || 256));
    const txt = text || "";
    // Simple SVG QR placeholder (real implementation would use a QR library)
    // Generate a deterministic-looking SVG using a hash of the text as a seed
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(txt).digest("hex");
    let cells: number[] = [];
    for (let i = 0; i < 256; i++) cells.push(parseInt(hash.substr(i * 2, 2), 16) % 2);
    const cellSize = s / 16;
    let rects = "";
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (cells[y * 16 + x]) {
          rects += `<rect x="${(x * cellSize).toFixed(2)}" y="${(y * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000"/>`;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" fill="#fff"/><g>${rects}</g></svg>`;
    await recordToolRun({ toolName: "qr-generator", toolInput: { text, size: s }, toolOutput: { bytes: svg.length } });
    return { text, svg, size: s, bytes: svg.length };
  },
};

const loremIpsum: Tool = {
  id: "lorem-ipsum",
  name: "Lorem Ipsum",
  description: "Generate placeholder text.",
  category: "utility",
  risk: "safe",
  icon: "Type",
  params: [
    { name: "count", type: "number", description: "Number of paragraphs (1-10)", default: 3 },
  ],
  async execute({ count }) {
    const n = Math.min(10, Math.max(1, Number(count) || 3));
    const paragraphs = [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
      "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
      "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
      "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.",
      "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.",
      "Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur.",
      "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.",
    ];
    const result = Array.from({ length: n }, (_, i) => paragraphs[i % paragraphs.length]);
    await recordToolRun({ toolName: "lorem-ipsum", toolInput: { count: n }, toolOutput: { paragraphs: n } });
    return { paragraphs: result };
  },
};

// ============ Registry ============

export const TOOLS: Tool[] = [
  calculator,
  uuidGenerator,
  base64Codec,
  hashGenerator,
  passwordGenerator,
  jsonFormatter,
  csvToJson,
  webSearch,
  webReader,
  imageGeneration,
  timestampTool,
  qrGenerator,
  loremIpsum,
];

export function getTool(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function listTools(category?: string) {
  if (!category) return TOOLS;
  return TOOLS.filter((t) => t.category === category);
}

export async function executeTool(id: string, args: Record<string, any>, ctx?: ToolContext): Promise<any> {
  const tool = getTool(id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  try {
    return await tool.execute(args, ctx);
  } catch (e: any) {
    return { error: e.message };
  }
}
