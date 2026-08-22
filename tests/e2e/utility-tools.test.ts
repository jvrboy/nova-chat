import { describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async (key: string) => storage.get(key) ?? null, setItem: async (key: string, value: string) => { storage.set(key, value); }, removeItem: async (key: string) => { storage.delete(key); }, multiSet: async (entries: Array<[string, string]>) => { entries.forEach(([key, value]) => storage.set(key, value)); }, multiRemove: async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); } } }));
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY', getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined }));

import { agentTools } from '../../src/agent/runtime';
import { advancedTools } from '../../src/agent/advancedTools';
import { operationsTools } from '../../src/agent/operationsTools';
import { productionTools } from '../../src/agent/productionTools';
import { utilityTools } from '../../src/agent/utilityTools';

const allLocalTools = [...agentTools, ...advancedTools, ...operationsTools, ...productionTools, ...utilityTools];

const run = async (id: string, input: string) => {
  const tool = utilityTools.find((t) => t.id === id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool.run(input, { files: [], log: async () => {} });
};

describe('on-device utility tools', () => {
  it('has a unique id for every local tool (no registry collisions)', () => {
    const ids = allLocalTools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('evaluates arithmetic safely with correct precedence', async () => {
    await expect(run('calculator', '(2 + 3) * 7')).resolves.toBe('(2 + 3) * 7 = 35');
    await expect(run('calculator', '2 ** 10')).resolves.toBe('2 ** 10 = 1024');
    await expect(run('calculator', 'drop table users')).rejects.toThrow();
    await expect(run('calculator', '1 / 0')).rejects.toThrow();
  });

  it('counts words, sentences, and reading time', async () => {
    const stats = JSON.parse((await run('word-count', 'One two three. Four five!')) as string);
    expect(stats.words).toBe(5);
    expect(stats.sentences).toBe(2);
  });

  it('converts between text cases', async () => {
    await expect(run('case-convert', 'camel | convert this title')).resolves.toBe('convertThisTitle');
    await expect(run('case-convert', 'snake | Convert This Title')).resolves.toBe('convert_this_title');
    await expect(run('case-convert', 'kebab | ConvertThis')).resolves.toBe('convert-this');
    await expect(run('case-convert', 'bogus | hi')).rejects.toThrow(/Unknown style/);
  });

  it('slugifies titles into url-safe slugs', async () => {
    await expect(run('slugify', 'My Best Blog Post! — 2026 Edition')).resolves.toBe('my-best-blog-post-2026-edition');
  });

  it('round-trips base64 and url codecs', async () => {
    const encoded = await run('base64-codec', 'encode | Ship it Friday');
    await expect(run('base64-codec', `decode | ${encoded}`)).resolves.toBe('Ship it Friday');
    const parsed = JSON.parse((await run('url-codec', 'parse | https://nova.app/search?q=tools&page=2')) as string);
    expect(parsed.params).toEqual({ q: 'tools', page: '2' });
    await expect(run('url-codec', 'encode | a b&c')).resolves.toBe('a%20b%26c');
  });

  it('generates uuid v4s in the requested count', async () => {
    const uuids = ((await run('uuid-generate', '3')) as string).split('\n');
    expect(uuids).toHaveLength(3);
    uuids.forEach((uuid) => expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  });

  it('generates passwords of the requested length', async () => {
    const password = (await run('password-generate', '24 yes')) as string;
    expect(password).toHaveLength(24);
  });

  it('validates json and reports syntax errors', async () => {
    await expect(run('json-format', '{"b":2,"a":1}')).resolves.toBe(JSON.stringify({ b: 2, a: 1 }, null, 2));
    await expect(run('json-format', '{invalid')).rejects.toThrow();
  });

  it('tests regexes without crashing on missing flags', async () => {
    const result = JSON.parse((await run('regex-test', '[A-Z]{3}-\\d{4} | Refs: XYZ-2026 and ABC-9999')) as string);
    expect(result.count).toBe(2);
    expect(result.matches[0].match).toBe('XYZ-2026');
    expect(result.matches[1].match).toBe('ABC-9999');
  });

  it('converts timestamps both directions', async () => {
    const fromUnix = JSON.parse((await run('timestamp-convert', '1780000000')) as string);
    expect(fromUnix.unixSeconds).toBe(1780000000);
    const backAndForth = JSON.parse((await run('timestamp-convert', fromUnix.iso)) as string);
    expect(backAndForth.unixSeconds).toBe(1780000000);
  });

  it('converts number bases', async () => {
    const bases = JSON.parse((await run('number-base', 'hex | ff00cc')) as string);
    expect(bases.decimal).toBe('16711884');
    expect(bases.binary.startsWith('11111111')).toBe(true);
  });

  it('converts colors between hex, rgb, and hsl', async () => {
    const color = JSON.parse((await run('color-convert', '#55d6ff')) as string);
    expect(color.hex).toBe('#55d6ff');
    expect(color.rgb).toBe('rgb(85, 214, 255)');
    expect(color.luminance).toBeGreaterThan(0.5);
  });

  it('generates lorem ipsum paragraphs', async () => {
    const text = (await run('lorem-ipsum', '2 20')) as string;
    expect(text.split('\n\n')).toHaveLength(2);
  });
});
