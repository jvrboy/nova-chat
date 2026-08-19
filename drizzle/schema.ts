import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  instructions: text("instructions"),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ userIdx: index("projects_user_idx").on(table.userId) }));

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  title: varchar("title", { length: 240 }).notNull(),
  model: varchar("model", { length: 64 }).default("nova-2").notNull(),
  isStarred: boolean("isStarred").default(false).notNull(),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ userIdx: index("conversations_user_idx").on(table.userId), projectIdx: index("conversations_project_idx").on(table.projectId) }));

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ conversationIdx: index("messages_conversation_idx").on(table.conversationId) }));

export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId"),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 160 }).notNull(),
  fileSize: int("fileSize").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ conversationIdx: index("attachments_conversation_idx").on(table.conversationId) }));

export const agentExecutions = mysqlTable("agentExecutions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  conversationId: int("conversationId"),
  agentId: varchar("agentId", { length: 64 }).notNull(),
  agentName: varchar("agentName", { length: 128 }).notNull(),
  input: text("input").notNull(),
  output: text("output"),
  toolResults: text("toolResults"),
  stepsUsed: int("stepsUsed").default(0).notNull(),
  duration: int("duration").default(0).notNull(),
  status: mysqlEnum("status", ["running", "completed", "error"]).default("running").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ userIdx: index("agent_executions_user_idx").on(table.userId), conversationIdx: index("agent_executions_conversation_idx").on(table.conversationId) }));

export const memoryEmbeddings = mysqlTable("memoryEmbeddings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  memoryKey: varchar("memoryKey", { length: 128 }).notNull(),
  kind: mysqlEnum("kind", ["preference", "fact", "goal", "conversation", "tool-result"]).notNull(),
  content: text("content").notNull(),
  tags: text("tags").notNull(),
  embedding: text("embedding").notNull(),
  embeddingModel: varchar("embeddingModel", { length: 128 }).notNull().default("nova-hash-v1"),
  embeddingDimensions: int("embeddingDimensions").notNull().default(128),
  importance: int("importance").notNull().default(50),
  retentionDays: int("retentionDays").notNull().default(365),
  expiresAt: timestamp("expiresAt"),
  lastAccessedAt: timestamp("lastAccessedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => ({ userIdx: index("memory_embeddings_user_idx").on(table.userId), expiryIdx: index("memory_embeddings_expiry_idx").on(table.expiresAt), keyIdx: index("memory_embeddings_key_idx").on(table.memoryKey) }));

export const userSessions = mysqlTable("userSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  userAgent: varchar("userAgent", { length: 512 }),
  ipHash: varchar("ipHash", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
}, (table) => ({ userIdx: index("user_sessions_user_idx").on(table.userId), expiryIdx: index("user_sessions_expiry_idx").on(table.expiresAt), activeIdx: index("user_sessions_active_idx").on(table.revokedAt, table.expiresAt) }));

export const realtimeConnections = mysqlTable("realtimeConnections", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId").notNull(),
  transport: mysqlEnum("transport", ["websocket", "sse"]).notNull(),
  channel: varchar("channel", { length: 128 }).notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  lastHeartbeatAt: timestamp("lastHeartbeatAt").defaultNow().notNull(),
  disconnectedAt: timestamp("disconnectedAt"),
}, (table) => ({ sessionIdx: index("realtime_connections_session_idx").on(table.sessionId), userIdx: index("realtime_connections_user_idx").on(table.userId), activeIdx: index("realtime_connections_active_idx").on(table.disconnectedAt, table.lastHeartbeatAt) }));

export const pipelineExecutions = mysqlTable("pipelineExecutions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  conversationId: int("conversationId"),
  pipelineId: varchar("pipelineId", { length: 128 }).notNull(),
  pipelineName: varchar("pipelineName", { length: 240 }).notNull(),
  input: text("input").notNull(),
  output: text("output"),
  stepResults: text("stepResults"),
  duration: int("duration").default(0).notNull(),
  status: mysqlEnum("status", ["running", "completed", "error"]).default("running").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ userIdx: index("pipeline_executions_user_idx").on(table.userId) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;
export type AgentExecution = typeof agentExecutions.$inferSelect;
export type InsertAgentExecution = typeof agentExecutions.$inferInsert;
export type MemoryEmbedding = typeof memoryEmbeddings.$inferSelect;
export type InsertMemoryEmbedding = typeof memoryEmbeddings.$inferInsert;
export type PipelineExecution = typeof pipelineExecutions.$inferSelect;
export type InsertPipelineExecution = typeof pipelineExecutions.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;
export type RealtimeConnection = typeof realtimeConnections.$inferSelect;
export type InsertRealtimeConnection = typeof realtimeConnections.$inferInsert;
