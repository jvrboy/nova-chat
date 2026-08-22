import { describe, expect, it } from 'vitest';
import { getTool, toolRegistry, assertPublicHttpsUrl } from '../src/lib/tools';

const runTool = async (id: string, input: Record<string, unknown>) => {
  const tool = getTool(id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool.run(input, { env: {} as never, workspaceId: 'test', actorId: 'test' });
};

describe('server utility tools', () => {
  it('registry exposes the new utility tools with unique ids', () => {
    const ids = toolRegistry.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    ['base64-codec', 'url-codec', 'jwt-decode', 'timestamp-convert', 'number-base-convert', 'case-convert', 'color-convert', 'slugify', 'password-generate', 'lorem-ipsum', 'cron-describe', 'keyword-extract', 'readability-score', 'html-strip'].forEach((id) => expect(ids).toContain(id));
  });

  it('regex-extract no longer crashes when flags are omitted', async () => {
    const outcome = (await runTool('regex-extract', { text: 'IDs: AB-12 and CD-34', pattern: '[A-Z]{2}-\\d{2}' })) as { matches: string[] };
    expect(outcome.matches).toEqual(['AB-12', 'CD-34']);
  });

  it('csv-to-json handles quoted commas, escaped quotes, and newlines', async () => {
    const result = (await runTool('csv-to-json', { csv: 'name,notes\n"Smith, John","said ""hi"""\nAmy,"multi\nline"' })) as { rows: Array<Record<string, string>>; count: number };
    expect(result.count).toBe(2);
    expect(result.rows[0].name).toBe('Smith, John');
    expect(result.rows[0].notes).toBe('said "hi"');
    expect(result.rows[1].notes).toContain('\n');
  });

  it('unit-convert falls through cleanly across categories', async () => {
    const ok = (await runTool('unit-convert', { value: 1, from: 'km', to: 'mi' })) as { result: number };
    expect(ok.result).toBeCloseTo(0.6213711, 5);
    const temp = (await runTool('unit-convert', { value: 100, from: 'c', to: 'f' })) as { result: number };
    expect(temp.result).toBeCloseTo(212, 5);
    await expect(runTool('unit-convert', { value: 1, from: 'km', to: 'f' })).rejects.toThrow(/mismatched/i);
  });

  it('qr-payload escapes reserved WiFi characters', async () => {
    const result = (await runTool('qr-payload', { kind: 'wifi', ssid: 'Home;Net', password: 'p@ss"word' })) as { payload: string };
    expect(result.payload).toBe('WIFI:T:WPA;S:Home\\;Net;P:p@ss\\"word;;');
  });

  it('web-fetch blocks private and metadata addresses', async () => {
    await expect(runTool('web-fetch', { url: 'http://169.254.169.254/latest/meta-data' })).rejects.toThrow();
    await expect(runTool('web-fetch', { url: 'https://localhost/secret' })).rejects.toThrow();
    await expect(runTool('web-fetch', { url: 'https://192.168.1.10/admin' })).rejects.toThrow();
  });

  it('jwt-decode parses header/payload without verifying', async () => {
    const token = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 100 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.sig`;
    const decoded = (await runTool('jwt-decode', { token })) as { header: Record<string, unknown>; payload: Record<string, unknown>; expired?: boolean };
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload.sub).toBe('user-1');
    expect(decoded.expired).toBe(true);
  });

  it('cron-describe describes schedules and computes next runs', async () => {
    const result = (await runTool('cron-describe', { expression: '*/15 9-17 * * 1-5', nextCount: 3 })) as { humanReadable: string; nextUtcRuns: string[] };
    expect(result.humanReadable).toContain('every 15 minutes');
    expect(result.nextUtcRuns.length).toBe(3);
    // All next runs must fall on a weekday between 09:00 and 17:59 UTC.
    result.nextUtcRuns.forEach((iso) => {
      const date = new Date(iso);
      const day = date.getUTCDay();
      expect(day === 0 || day === 6).toBe(false);
      expect(date.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(date.getUTCHours()).toBeLessThanOrEqual(17);
      expect(date.getUTCMinutes() % 15).toBe(0);
    });
  });

  it('keyword-extract ranks meaningful terms without stopwords', async () => {
    const result = (await runTool('keyword-extract', { text: 'Deploy the deploy pipeline. The pipeline deploys fast; fast pipelines win.', limit: 3 })) as { keywords: Array<{ term: string; count: number }> };
    expect(result.keywords[0].term).toMatch(/deploy|pipeline|pipelines|fast|win/);
    expect(result.keywords.every((k) => !['the', 'and'].includes(k.term))).toBe(true);
  });

  it('readability-score returns Flesch metrics for prose', async () => {
    const result = (await runTool('readability-score', { text: 'The cat sat on the mat. It was warm.' })) as { fleschEase: number; words: number; sentences: number };
    expect(result.words).toBe(9);
    expect(result.sentences).toBe(2);
    expect(result.fleschEase).toBeGreaterThan(50);
  });

  it('html-strip removes scripts, tags, and entities', async () => {
    const result = (await runTool('html-strip', { html: '<p>A &amp; B</p><script>alert(1)</script><div>C</div>' })) as { text: string };
    expect(result.text).not.toContain('<');
    expect(result.text).not.toContain('alert(1)');
    expect(result.text).toContain('A & B');
  });

  it('assertPublicHttpsUrl rejects SSRF targets and allows public https', () => {
    expect(() => assertPublicHttpsUrl('ftp://example.com')).toThrow();
    expect(() => assertPublicHttpsUrl('https://127.0.0.1/x')).toThrow();
    expect(() => assertPublicHttpsUrl('https://metadata.google.internal/x')).toThrow();
    expect(assertPublicHttpsUrl('https://example.com/ok').hostname).toBe('example.com');
  });
});
