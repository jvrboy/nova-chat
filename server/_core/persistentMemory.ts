import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { memoryEmbeddings, type InsertMemoryEmbedding } from "../../drizzle/schema";
import { getDb } from "../db";

export type PersistentMemoryKind = "preference" | "fact" | "goal" | "conversation" | "tool-result";
export type PersistentMemoryInput = { userId: number; kind: PersistentMemoryKind; content: string; tags?: string[]; importance?: number; retentionDays?: number };

const DIMENSIONS = 128;
const retentionDefaults: Record<PersistentMemoryKind, number> = { preference: 730, fact: 365, goal: 180, conversation: 90, "tool-result": 30 };

function hashToken(token: string) { let hash = 2166136261; for (const character of token) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return Math.abs(hash) % DIMENSIONS; }
export function createEmbedding(text: string, dimensions = DIMENSIONS) { const vector = Array.from({ length: dimensions }, () => 0); const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1); for (const token of tokens) { vector[hashToken(token) % dimensions] += 1; } const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1; return vector.map(value => Number((value / magnitude).toFixed(8))); }
function cosine(a: number[], b: number[]) { let dot = 0, aMag = 0, bMag = 0; const length = Math.min(a.length, b.length); for (let i = 0; i < length; i += 1) { dot += a[i] * b[i]; aMag += a[i] ** 2; bMag += b[i] ** 2; } return aMag && bMag ? dot / Math.sqrt(aMag * bMag) : 0; }
function expiryDate(days: number) { const expiry = new Date(); expiry.setTime(expiry.getTime() + Math.max(1, days) * 86_400_000); return expiry; }

export async function storePersistentMemory(input: PersistentMemoryInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const retentionDays = input.retentionDays ?? retentionDefaults[input.kind];
  const embedding = createEmbedding(`${input.content} ${(input.tags ?? []).join(" ")}`);
  const memoryKey = `u${input.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const values: InsertMemoryEmbedding = { userId: input.userId, memoryKey, kind: input.kind, content: input.content, tags: JSON.stringify(input.tags ?? []), embedding: JSON.stringify(embedding), embeddingModel: "nova-hash-v1", embeddingDimensions: embedding.length, importance: Math.round(Math.max(0, Math.min(1, input.importance ?? .5)) * 100), retentionDays, expiresAt: expiryDate(retentionDays) };
  const result = await db.insert(memoryEmbeddings).values(values);
  const rows = await db.select().from(memoryEmbeddings).where(eq(memoryEmbeddings.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}

export async function recallPersistentMemories(userId: number, query: string, limit = 8) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await purgeExpiredMemories(userId);
  const rows = await db.select().from(memoryEmbeddings).where(and(eq(memoryEmbeddings.userId, userId), isNull(memoryEmbeddings.deletedAt), or(isNull(memoryEmbeddings.expiresAt), gt(memoryEmbeddings.expiresAt, new Date())))).orderBy(desc(memoryEmbeddings.updatedAt)).limit(500);
  const queryVector = createEmbedding(query);
  const ranked = rows.map(row => { let embedding: number[] = []; try { embedding = JSON.parse(row.embedding) as number[]; } catch { /* skip malformed vectors */ } return { ...row, score: cosine(queryVector, embedding) + row.importance / 1000 }; }).sort((a, b) => b.score - a.score).slice(0, limit);
  const now = new Date();
  await Promise.all(ranked.map(row => db.update(memoryEmbeddings).set({ lastAccessedAt: now }).where(eq(memoryEmbeddings.id, row.id))));
  return ranked;
}

export async function listPersistentMemories(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await purgeExpiredMemories(userId);
  return db.select().from(memoryEmbeddings).where(and(eq(memoryEmbeddings.userId, userId), isNull(memoryEmbeddings.deletedAt))).orderBy(desc(memoryEmbeddings.updatedAt)).limit(limit);
}

export async function forgetPersistentMemory(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(memoryEmbeddings).set({ deletedAt: new Date() }).where(and(eq(memoryEmbeddings.id, id), eq(memoryEmbeddings.userId, userId)));
  return { deleted: true, id };
}

export async function purgeExpiredMemories(userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const conditions = [isNull(memoryEmbeddings.deletedAt), lt(memoryEmbeddings.expiresAt, new Date())];
  if (userId !== undefined) conditions.push(eq(memoryEmbeddings.userId, userId));
  await db.update(memoryEmbeddings).set({ deletedAt: new Date() }).where(and(...conditions));
  return { purged: true, userId: userId ?? null };
}

export function retentionPolicy() { return { defaults: retentionDefaults, embeddingModel: "nova-hash-v1", dimensions: DIMENSIONS, behavior: "Memories expire by kind-specific retention period, are soft-deleted on expiry, and can be manually forgotten." }; }
