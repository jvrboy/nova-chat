import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { generateMidi, midiToBase64 } from '../lib/midi'
import { appendAudit } from '../lib/db'
const midi = new Hono<AppEnv>()
midi.post('/generate', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { bytes, meta } = generateMidi({ key: body.key, tempo: body.tempo, bars: body.bars, style: body.style, seed: body.seed })
  await appendAudit(c.env.DB, { workspaceId: c.get('workspaceId'), actorId: c.get('actorId'), action: 'midi.generate', resource: 'midi', risk: 'low', metadata: meta })
  return c.json({ ok: true, format: 'smf-0', base64: midiToBase64(bytes), filename: `nova-${meta.style}-${meta.key}-${meta.tempo}bpm.mid`, meta })
})
midi.get('/generate', (c) => {
  const { bytes, meta } = generateMidi({ key: c.req.query('key'), tempo: Number(c.req.query('tempo')) || undefined, bars: Number(c.req.query('bars')) || undefined, style: c.req.query('style') as never, seed: Number(c.req.query('seed')) || undefined })
  return new Response(bytes.buffer as ArrayBuffer, { headers: { 'Content-Type': 'audio/midi', 'Content-Disposition': `attachment; filename="nova-${meta.style}.mid"` } })
})
export default midi
