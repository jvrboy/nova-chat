import type { Bindings } from './types'

/**
 * Sends push notifications via Expo's push service (https://exp.host/--/api/v2/push/send).
 * Works for any Expo Go / EAS-built app that registered an Expo push token —
 * no Firebase/APNs setup required on our side, Expo brokers both.
 */
export async function sendPushNotification(
  env: Bindings,
  tokens: string[],
  notification: { title: string; body: string; data?: Record<string, unknown> }
): Promise<{ sent: number; errors: unknown[] }> {
  if (!tokens.length) return { sent: 0, errors: [] }

  const messages = tokens.map((to) => ({
    to,
    title: notification.title,
    body: notification.body,
    data: notification.data ?? {},
    sound: 'default',
  }))

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
    })
    const data = (await response.json().catch(() => ({}))) as { data?: unknown[] }
    const items = Array.isArray(data.data) ? data.data : []
    const errors = items.filter((item: any) => item?.status === 'error')
    return { sent: items.length - errors.length, errors }
  } catch (error) {
    return { sent: 0, errors: [error instanceof Error ? error.message : 'push send failed'] }
  }
}

/** Fetches all registered push tokens for a workspace and sends to all of them. */
export async function notifyWorkspace(
  env: Bindings,
  db: D1Database,
  workspaceId: string,
  notification: { title: string; body: string; data?: Record<string, unknown> }
) {
  const { results } = await db.prepare('SELECT token FROM push_tokens WHERE workspace_id = ?').bind(workspaceId).all<{ token: string }>()
  const tokens = results.map((r) => r.token)
  if (!tokens.length) return { sent: 0, errors: [] }
  return sendPushNotification(env, tokens, notification)
}
