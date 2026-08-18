import { and, asc, desc, eq } from "drizzle-orm";
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

export async function createMessage(input: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(messages).values(input);
  return db.select().from(messages).where(eq(messages.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}
