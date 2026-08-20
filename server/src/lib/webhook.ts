// Real HMAC-SHA256 webhook signing using Web Crypto (replaces the old fake
// hashing function that just summed char codes).
export async function createWebhookSignature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256=${hex}`
}
