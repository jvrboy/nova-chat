import { and, asc, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "./_core/env";
import {
  conversations,
  InsertConversation,
  InsertMessage,
  InsertProject,
  InsertUser,
  messages,
  projects,
  users,
  realtimeConnections,
  userSessions,
  type InsertRealtimeConnection,
  type InsertUserSession,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) { values.role = user.role ?? "admin"; updateSet.role = values.role; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.isArchived, false))).orderBy(desc(projects.updatedAt));
}

export async function createProject(input: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(projects).values(input);
  return db.select().from(projects).where(eq(projects.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}

export async function updateProject(userId: number, id: number, values: Partial<Pick<InsertProject, "name" | "description" | "instructions">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(projects).set(values).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1).then((rows) => rows[0]);
}

export async function listConversations(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const filters = [eq(conversations.userId, userId), eq(conversations.isArchived, false)];
  if (projectId !== undefined) filters.push(eq(conversations.projectId, projectId));
  return db.select().from(conversations).where(and(...filters)).orderBy(desc(conversations.updatedAt));
}

export async function createConversation(input: InsertConversation) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(conversations).values(input);
  return db.select().from(conversations).where(eq(conversations.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}

export async function updateConversation(userId: number, id: number, values: Partial<Pick<InsertConversation, "title" | "model" | "isStarred" | "isArchived" | "projectId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(conversations).set(values).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1).then((rows) => rows[0]);
}

export async function getConversation(userId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conversation = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1).then((rows) => rows[0]);
  if (!conversation) return undefined;
  const thread = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
  return { ...conversation, messages: thread };
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUserSession(input: Omit<InsertUserSession, "tokenHash"> & { token: string }) {
  const db = await getDb();
  if (!db) return undefined;
  const { token, ...values } = input;
  const result = await db.insert(userSessions).values({ ...values, tokenHash: hashSessionToken(token) });
  return db.select().from(userSessions).where(eq(userSessions.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}

export async function getActiveUserSession(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  return db.select().from(userSessions).where(and(eq(userSessions.tokenHash, hashSessionToken(token)), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, new Date()))).limit(1).then((rows) => rows[0]);
}

export async function touchUserSession(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(userSessions).set({ lastSeenAt: new Date() }).where(and(eq(userSessions.id, id), isNull(userSessions.revokedAt)));
}

export async function revokeUserSession(token: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.tokenHash, hashSessionToken(token)), isNull(userSessions.revokedAt)));
}

export async function pruneExpiredUserSessions() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(userSessions).set({ revokedAt: new Date() }).where(and(lt(userSessions.expiresAt, new Date()), isNull(userSessions.revokedAt)));
  return Number(result[0].affectedRows ?? 0);
}

export async function createRealtimeConnection(input: InsertRealtimeConnection) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(realtimeConnections).values(input);
  return db.select().from(realtimeConnections).where(eq(realtimeConnections.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}

export async function heartbeatRealtimeConnection(id: number, sessionId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(realtimeConnections).set({ lastHeartbeatAt: new Date() }).where(and(eq(realtimeConnections.id, id), eq(realtimeConnections.sessionId, sessionId), isNull(realtimeConnections.disconnectedAt)));
}

export async function disconnectRealtimeConnection(id: number, sessionId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(realtimeConnections).set({ disconnectedAt: new Date() }).where(and(eq(realtimeConnections.id, id), eq(realtimeConnections.sessionId, sessionId), isNull(realtimeConnections.disconnectedAt)));
}

export async function listActiveRealtimeConnections(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(realtimeConnections).where(and(eq(realtimeConnections.userId, userId), isNull(realtimeConnections.disconnectedAt))).orderBy(desc(realtimeConnections.lastHeartbeatAt));
}

export async function createMessage(input: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(messages).values(input);
  return db.select().from(messages).where(eq(messages.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}
