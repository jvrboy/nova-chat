/**
 * Brain DB adapter — replaces the brain-project's Prisma client (`@/lib/db`)
 * with a D1-backed facade exposing the same subset of the Prisma API that the
 * brain modules use. Cloudflare Workers can't hold a global Prisma client, so
 * the D1 binding is injected per request via bindBrainDb() before any brain
 * call (brain state is already isolate-scoped by design in the original code).
 *
 * Supported Prisma-ish surface:
 *   db.<model>.create({ data })
 *   db.<model>.findUnique({ where })
 *   db.<model>.findFirst({ where?, orderBy? })
 *   db.<model>.findMany({ where?, orderBy?, take?, select? })
 *   db.<model>.update({ where, data })   — data supports { field: { increment: n } }
 *   db.<model>.delete({ where })
 *   db.<model>.count({ where? })
 * where supports equality and { field: { gte: n } }.
 */
import type { D1Database } from '@cloudflare/workers-types'

type AnyRecord = Record<string, any>

const MODEL_TABLE: Record<string, string> = {
  cognition: 'brain_cognition',
  memory: 'brain_memory',
  task: 'brain_task',
  skill: 'brain_skill',
  reflection: 'brain_reflection',
  trainingRun: 'brain_training_run',
  knowledge: 'brain_knowledge',
  metric: 'brain_metric',
}

// camelCase field -> snake_case column (only where they differ)
const FIELD_COL: Record<string, string> = {
  taskId: 'task_id',
  createdAt: 'created_at',
  lastAccess: 'last_access',
  accessCount: 'access_count',
  relatedIds: 'related_ids',
  maxAttempts: 'max_attempts',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  successRate: 'success_rate',
  updatedAt: 'updated_at',
  taskCount: 'task_count',
  successCount: 'success_count',
  failureCount: 'failure_count',
  avgScore: 'avg_score',
}

// Columns that hold datetimes — converted to Date objects on read (the brain
// calls .getTime() on these) and ISO strings on write.
const DATE_COLS = new Set(['created_at', 'last_access', 'started_at', 'finished_at', 'updated_at'])
// Columns stored as INTEGER boolean
const BOOL_COLS = new Set(['applied'])

function toCol(field: string): string {
  return FIELD_COL[field] ?? field
}

let counter = 0
function cuid(): string {
  const t = Date.now().toString(36)
  const r = (++counter).toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 10)
  return `c${t}${r}`
}

let currentDb: D1Database | null = null

/** Bind the request-scoped D1 database before any brain call. */
export function bindBrainDb(d1: D1Database): void {
  currentDb = d1
}

function getDb(): D1Database {
  if (!currentDb) throw new Error('Brain DB not bound — call bindBrainDb(env.DB) first.')
  return currentDb
}

function serializeValue(col: string, v: any): any {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'boolean' && BOOL_COLS.has(col)) return v ? 1 : 0
  if (v === undefined) return null
  return v
}

function rowToRecord(table: string, row: AnyRecord): AnyRecord {
  const out: AnyRecord = {}
  for (const [col, val] of Object.entries(row)) {
    // snake_case -> camelCase (reverse of FIELD_COL, plus generic conversion)
    const field = Object.keys(FIELD_COL).find((k) => FIELD_COL[k] === col) ?? col.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())
    if (val === null) { out[field] = null; continue }
    if (DATE_COLS.has(col)) { out[field] = new Date(String(val).replace(' ', 'T') + (String(val).includes('Z') || String(val).includes('T') ? '' : 'Z')); continue }
    if (BOOL_COLS.has(col)) { out[field] = !!val; continue }
    out[field] = val
  }
  return out
}

type Where = AnyRecord | undefined

function buildWhere(where: Where): { sql: string; params: any[] } {
  if (!where) return { sql: '', params: [] }
  const clauses: string[] = []
  const params: any[] = []
  for (const [field, cond] of Object.entries(where)) {
    const col = toCol(field)
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ('gte' in cond) { clauses.push(`${col} >= ?`); params.push(cond.gte) }
      else if ('lte' in cond) { clauses.push(`${col} <= ?`); params.push(cond.lte) }
      else if ('gt' in cond) { clauses.push(`${col} > ?`); params.push(cond.gt) }
      else if ('lt' in cond) { clauses.push(`${col} < ?`); params.push(cond.lt) }
      else if ('not' in cond) { clauses.push(`${col} != ?`); params.push(serializeValue(col, cond.not)) }
    } else {
      clauses.push(`${col} = ?`)
      params.push(serializeValue(col, cond))
    }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params }
}

function buildOrder(orderBy: AnyRecord | undefined): string {
  if (!orderBy) return ''
  const [field, dir] = Object.entries(orderBy)[0]
  return ` ORDER BY ${toCol(field)} ${String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`
}

function makeModel(model: string) {
  const table = MODEL_TABLE[model]
  if (!table) throw new Error(`Unknown brain model: ${model}`)
  return {
    async create({ data }: { data: AnyRecord }): Promise<AnyRecord> {
      const withId: AnyRecord = { id: cuid(), ...data }
      const fields = Object.keys(withId)
      const cols = fields.map(toCol)
      const vals = fields.map((f) => serializeValue(toCol(f), withId[f]))
      await getDb().prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...vals).run()
      const row = await getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(withId.id).first()
      return rowToRecord(table, row as AnyRecord)
    },
    async findUnique({ where }: { where: AnyRecord }): Promise<AnyRecord | null> {
      const { sql, params } = buildWhere(where)
      const row = await getDb().prepare(`SELECT * FROM ${table}${sql} LIMIT 1`).bind(...params).first()
      return row ? rowToRecord(table, row as AnyRecord) : null
    },
    async findFirst({ where, orderBy }: { where?: Where; orderBy?: AnyRecord } = {}): Promise<AnyRecord | null> {
      const { sql, params } = buildWhere(where)
      const row = await getDb().prepare(`SELECT * FROM ${table}${sql}${buildOrder(orderBy)} LIMIT 1`).bind(...params).first()
      return row ? rowToRecord(table, row as AnyRecord) : null
    },
    async findMany({ where, orderBy, take, select }: { where?: Where; orderBy?: AnyRecord; take?: number; select?: AnyRecord } = {}): Promise<AnyRecord[]> {
      const { sql, params } = buildWhere(where)
      const limit = take ? ` LIMIT ${Math.max(1, Math.floor(take))}` : ''
      const { results } = await getDb().prepare(`SELECT * FROM ${table}${sql}${buildOrder(orderBy)}${limit}`).bind(...params).all()
      const allRows = ((results ?? []) as AnyRecord[]).map((r) => rowToRecord(table, r))
      if (select) {
        const keys = Object.keys(select).filter((k) => (select as AnyRecord)[k])
        return allRows.map((r) => Object.fromEntries(keys.map((k) => [k, (r as AnyRecord)[k]])))
      }
      return allRows
    },
    async update({ where, data }: { where: AnyRecord; data: AnyRecord }): Promise<AnyRecord | null> {
      const existing = await this.findUnique({ where })
      if (!existing) return null
      const sets: string[] = []
      const params: any[] = []
      for (const [field, val] of Object.entries(data)) {
        const col = toCol(field)
        if (val && typeof val === 'object' && !(val instanceof Date) && 'increment' in val) {
          sets.push(`${col} = COALESCE(${col}, 0) + ?`)
          params.push(val.increment)
        } else if (val && typeof val === 'object' && !(val instanceof Date) && 'decrement' in val) {
          sets.push(`${col} = COALESCE(${col}, 0) - ?`)
          params.push(val.decrement)
        } else {
          sets.push(`${col} = ?`)
          params.push(serializeValue(col, val))
        }
      }
      if (cols4tableHas(table, 'updated_at') && !('updatedAt' in data)) {
        sets.push(`updated_at = ?`)
        params.push(new Date().toISOString())
      }
      const { sql, params: wparams } = buildWhere(where)
      await getDb().prepare(`UPDATE ${table} SET ${sets.join(', ')}${sql}`).bind(...params, ...wparams).run()
      return this.findUnique({ where })
    },
    async delete({ where }: { where: AnyRecord }): Promise<void> {
      const { sql, params } = buildWhere(where)
      await getDb().prepare(`DELETE FROM ${table}${sql}`).bind(...params).run()
    },
    async count({ where }: { where?: Where } = {}): Promise<number> {
      const { sql, params } = buildWhere(where)
      const row = await getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}${sql}`).bind(...params).first()
      return Number((row as AnyRecord)?.n ?? 0)
    },
  }
}

const TABLES_WITH_UPDATED_AT = new Set(['brain_skill'])
function cols4tableHas(table: string, col: string): boolean {
  return TABLES_WITH_UPDATED_AT.has(table) && col === 'updated_at'
}

interface BrainModel {
  create(args: { data: AnyRecord }): Promise<AnyRecord>
  findUnique(args: { where: AnyRecord }): Promise<AnyRecord | null>
  findFirst(args?: { where?: Where; orderBy?: AnyRecord }): Promise<AnyRecord | null>
  findMany(args?: { where?: Where; orderBy?: AnyRecord; take?: number; select?: AnyRecord }): Promise<AnyRecord[]>
  update(args: { where: AnyRecord; data: AnyRecord }): Promise<AnyRecord | null>
  delete(args: { where: AnyRecord }): Promise<void>
  count(args?: { where?: Where }): Promise<number>
}

/** Prisma-compatible facade. The brain modules use it exactly like `db` from the original repo. */
export const db = new Proxy({} as Record<string, BrainModel>, {
  get(_, model: string) {
    return makeModel(model) as BrainModel
  },
})
