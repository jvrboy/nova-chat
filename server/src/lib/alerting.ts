import type { Bindings } from './types'
import { createWebhookSignature } from './webhook'
import { nowIso } from './ids'
import { notifyWorkspace } from './push'

/**
 * Evaluates alert rules for a workspace against real metrics in request_log /
 * jobs, and fires a signed webhook via the connector's endpoint when a
 * threshold is breached. Intended to be called from the Cron Trigger.
 */
export async function evaluateAlerts(env: Bindings, workspaceId: string) {
  const db = env.DB
  const { results: rules } = await db.prepare('SELECT * FROM alert_rules WHERE workspace_id = ? AND enabled = 1').bind(workspaceId).all<any>()
  const triggered: Array<{ ruleId: string; name: string; value: number }> = []

  for (const rule of rules) {
    const since = new Date(Date.now() - rule.window_minutes * 60_000).toISOString()
    let value = 0

    if (rule.metric === 'error_rate') {
      const row = await db.prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as errors
         FROM request_log WHERE workspace_id = ? AND created_at >= ?`
      ).bind(workspaceId, since).first<{ total: number; errors: number }>()
      value = row && row.total > 0 ? (row.errors / row.total) * 100 : 0
    } else if (rule.metric === 'job_dead_letters') {
      const row = await db.prepare(`SELECT COUNT(*) as count FROM jobs WHERE workspace_id = ? AND status = 'dead' AND updated_at >= ?`).bind(workspaceId, since).first<{ count: number }>()
      value = row?.count ?? 0
    } else if (rule.metric === 'latency_p95') {
      const row = await db.prepare(`SELECT latency_ms FROM request_log WHERE workspace_id = ? AND created_at >= ? ORDER BY latency_ms ASC`).bind(workspaceId, since).all<{ latency_ms: number }>()
      const sorted = row.results.map((r) => r.latency_ms)
      value = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] : 0
    } else if (rule.metric === 'request_volume') {
      const row = await db.prepare(`SELECT COUNT(*) as count FROM request_log WHERE workspace_id = ? AND created_at >= ?`).bind(workspaceId, since).first<{ count: number }>()
      value = row?.count ?? 0
    }

    if (value >= rule.threshold) {
      triggered.push({ ruleId: rule.id, name: rule.name, value })
      await db.prepare('UPDATE alert_rules SET last_triggered_at = ? WHERE id = ?').bind(nowIso(), rule.id).run()
      notifyWorkspace(env, db, workspaceId, { title: `Alert: ${rule.name}`, body: `${rule.metric} = ${value.toFixed(1)} (threshold ${rule.threshold})`, data: { type: 'alert', ruleId: rule.id } }).catch(() => {})

      if (rule.webhook_connector_id) {
        const connector = await db.prepare('SELECT * FROM connectors WHERE id = ?').bind(rule.webhook_connector_id).first<any>()
        if (connector?.endpoint) {
          const payload = JSON.stringify({ event: 'alert.triggered', ruleId: rule.id, name: rule.name, metric: rule.metric, value, threshold: rule.threshold, at: nowIso() })
          const signature = await createWebhookSignature(payload, connector.id)
          try {
            await fetch(connector.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nova-Signature': signature }, body: payload })
          } catch {
            // best-effort delivery; failure is visible via connector status on next test-fire
          }
        }
      }
    }
  }

  return { evaluated: rules.length, triggered }
}
