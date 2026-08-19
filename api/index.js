// server/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, asc, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  oauthPortalUrl: process.env.VITE_OAUTH_PORTAL_URL ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  providerOrder: process.env.NOVA_PROVIDER_ORDER ?? "gemini,groq,ollama-cloud,openrouter",
  geminiApiKeys: process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY ?? "",
  groqApiKeys: process.env.GROQ_API_KEYS ?? process.env.GROQ_API_KEY ?? "",
  ollamaCloudApiKeys: process.env.OLLAMA_CLOUD_API_KEYS ?? process.env.OLLAMA_CLOUD_API_KEY ?? "",
  openrouterApiKeys: process.env.OPENROUTER_API_KEYS ?? process.env.OPENROUTER_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  ollamaCloudModel: process.env.OLLAMA_CLOUD_MODEL ?? "llama3.2",
  ollamaCloudBaseUrl: process.env.OLLAMA_CLOUD_BASE_URL ?? "https://ollama.com/v1",
  openrouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  kaggleApiKeys: process.env.KAGGLE_API_KEYS ?? process.env.KAGGLE_API_KEY ?? "",
  firecrawlApiKeys: process.env.FIRECRAWL_API_KEYS ?? process.env.FIRECRAWL_API_KEY ?? "",
  e2bApiKeys: process.env.E2B_API_KEYS ?? process.env.E2B_API_KEY ?? "",
  cloudflareWorkerUrl: process.env.CLOUDFLARE_WORKER_URL ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  massiveWsUrl: process.env.MASSIVE_WS_URL ?? "",
  massiveApiKey: process.env.MASSIVE_API_KEY ?? "",
  passwordHash: process.env.NOVA_ACCESS_PASSWORD_HASH ?? ""
};

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  instructions: text("instructions"),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({ userIdx: index("projects_user_idx").on(table.userId) }));
var conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  title: varchar("title", { length: 240 }).notNull(),
  model: varchar("model", { length: 64 }).default("nova-2").notNull(),
  isStarred: boolean("isStarred").default(false).notNull(),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({ userIdx: index("conversations_user_idx").on(table.userId), projectIdx: index("conversations_project_idx").on(table.projectId) }));
var messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({ conversationIdx: index("messages_conversation_idx").on(table.conversationId) }));
var attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId"),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 160 }).notNull(),
  fileSize: int("fileSize").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: varchar("url", { length: 1e3 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({ conversationIdx: index("attachments_conversation_idx").on(table.conversationId) }));
var agentExecutions = mysqlTable("agentExecutions", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({ userIdx: index("agent_executions_user_idx").on(table.userId), conversationIdx: index("agent_executions_conversation_idx").on(table.conversationId) }));
var memoryEmbeddings = mysqlTable("memoryEmbeddings", {
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
  deletedAt: timestamp("deletedAt")
}, (table) => ({ userIdx: index("memory_embeddings_user_idx").on(table.userId), expiryIdx: index("memory_embeddings_expiry_idx").on(table.expiresAt), keyIdx: index("memory_embeddings_key_idx").on(table.memoryKey) }));
var userSessions = mysqlTable("userSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  userAgent: varchar("userAgent", { length: 512 }),
  ipHash: varchar("ipHash", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt")
}, (table) => ({ userIdx: index("user_sessions_user_idx").on(table.userId), expiryIdx: index("user_sessions_expiry_idx").on(table.expiresAt), activeIdx: index("user_sessions_active_idx").on(table.revokedAt, table.expiresAt) }));
var realtimeConnections = mysqlTable("realtimeConnections", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId").notNull(),
  transport: mysqlEnum("transport", ["websocket", "sse"]).notNull(),
  channel: varchar("channel", { length: 128 }).notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  lastHeartbeatAt: timestamp("lastHeartbeatAt").defaultNow().notNull(),
  disconnectedAt: timestamp("disconnectedAt")
}, (table) => ({ sessionIdx: index("realtime_connections_session_idx").on(table.sessionId), userIdx: index("realtime_connections_user_idx").on(table.userId), activeIdx: index("realtime_connections_active_idx").on(table.disconnectedAt, table.lastHeartbeatAt) }));
var pipelineExecutions = mysqlTable("pipelineExecutions", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({ userIdx: index("pipeline_executions_user_idx").on(table.userId) }));

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  for (const field of textFields) {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? /* @__PURE__ */ new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== void 0 || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
async function listProjects(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.isArchived, false))).orderBy(desc(projects.updatedAt));
}
async function createProject(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(projects).values(input);
  return db.select().from(projects).where(eq(projects.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}
async function updateProject(userId, id, values) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(projects).set(values).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1).then((rows) => rows[0]);
}
async function listConversations(userId, projectId) {
  const db = await getDb();
  if (!db) return [];
  const filters = [eq(conversations.userId, userId), eq(conversations.isArchived, false)];
  if (projectId !== void 0) filters.push(eq(conversations.projectId, projectId));
  return db.select().from(conversations).where(and(...filters)).orderBy(desc(conversations.updatedAt));
}
async function createConversation(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(conversations).values(input);
  return db.select().from(conversations).where(eq(conversations.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}
async function updateConversation(userId, id, values) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(conversations).set(values).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1).then((rows) => rows[0]);
}
async function getConversation(userId, id) {
  const db = await getDb();
  if (!db) return void 0;
  const conversation = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1).then((rows) => rows[0]);
  if (!conversation) return void 0;
  const thread = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
  return { ...conversation, messages: thread };
}
function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
async function createUserSession(input) {
  const db = await getDb();
  if (!db) return void 0;
  const { token, ...values } = input;
  const result = await db.insert(userSessions).values({ ...values, tokenHash: hashSessionToken(token) });
  return db.select().from(userSessions).where(eq(userSessions.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}
async function getActiveUserSession(token) {
  const db = await getDb();
  if (!db) return void 0;
  return db.select().from(userSessions).where(and(eq(userSessions.tokenHash, hashSessionToken(token)), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, /* @__PURE__ */ new Date()))).limit(1).then((rows) => rows[0]);
}
async function touchUserSession(id) {
  const db = await getDb();
  if (!db) return;
  await db.update(userSessions).set({ lastSeenAt: /* @__PURE__ */ new Date() }).where(and(eq(userSessions.id, id), isNull(userSessions.revokedAt)));
}
async function revokeUserSession(token) {
  const db = await getDb();
  if (!db) return;
  await db.update(userSessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(and(eq(userSessions.tokenHash, hashSessionToken(token)), isNull(userSessions.revokedAt)));
}
async function createRealtimeConnection(input) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.insert(realtimeConnections).values(input);
  return db.select().from(realtimeConnections).where(eq(realtimeConnections.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}
async function heartbeatRealtimeConnection(id, sessionId) {
  const db = await getDb();
  if (!db) return;
  await db.update(realtimeConnections).set({ lastHeartbeatAt: /* @__PURE__ */ new Date() }).where(and(eq(realtimeConnections.id, id), eq(realtimeConnections.sessionId, sessionId), isNull(realtimeConnections.disconnectedAt)));
}
async function disconnectRealtimeConnection(id, sessionId) {
  const db = await getDb();
  if (!db) return;
  await db.update(realtimeConnections).set({ disconnectedAt: /* @__PURE__ */ new Date() }).where(and(eq(realtimeConnections.id, id), eq(realtimeConnections.sessionId, sessionId), isNull(realtimeConnections.disconnectedAt)));
}
async function listActiveRealtimeConnections(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(realtimeConnections).where(and(eq(realtimeConnections.userId, userId), isNull(realtimeConnections.disconnectedAt))).orderBy(desc(realtimeConnections.lastHeartbeatAt));
}
async function createMessage(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(messages).values(input);
  return db.select().from(messages).where(eq(messages.id, Number(result[0].insertId))).limit(1).then((rows) => rows[0]);
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    if (ENV.databaseUrl) {
      const persistedSession = await getActiveUserSession(sessionToken ?? "");
      if (!persistedSession) throw ForbiddenError("Session is not active or has expired");
      await touchUserSession(persistedSession.id);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const persistedUser = await getUserByOpenId(userInfo.openId);
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      if (persistedUser && process.env.DATABASE_URL) await createUserSession({ token: sessionToken, userId: persistedUser.id, userAgent: req.headers["user-agent"]?.slice(0, 512) ?? null, ipHash: null, expiresAt: new Date(Date.now() + ONE_YEAR_MS) });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { z as z2 } from "zod";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader3 } from "cookie";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages: messages2,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages2.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
async function listLLMModels() {
  assertApiKey();
  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models` : "https://forge.manus.im/v1/models";
  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/_core/imageGeneration.ts
var DEFAULT_IMAGE_MODEL = "MODEL_GPT_IMAGE_2";
var DEFAULT_IMAGE_QUALITY = "medium";
async function generateImage(options) {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/GenerateImage",
    baseUrl
  ).toString();
  const model = options.model ?? DEFAULT_IMAGE_MODEL;
  const quality = options.quality ?? (model === DEFAULT_IMAGE_MODEL ? DEFAULT_IMAGE_QUALITY : void 0);
  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify({
      prompt: options.prompt,
      original_images: options.originalImages || [],
      model,
      ...quality ? { quality } : {}
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }
  const result = await response.json();
  const base64Data = result.image.b64Json;
  const buffer = Buffer.from(base64Data, "base64");
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    result.image.mimeType
  );
  return {
    url
  };
}
async function listImageModels() {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/ListModels",
    baseUrl
  ).toString();
  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: "{}"
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `List image models failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }
  const result = await response.json();
  return { models: result.models ?? [] };
}

// server/_core/voiceTranscription.ts
async function transcribeAudio(options) {
  try {
    if (!ENV.forgeApiUrl) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_URL is not set"
      };
    }
    if (!ENV.forgeApiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_KEY is not set"
      };
    }
    let audioBuffer;
    let mimeType;
    try {
      const response2 = await fetch(options.audioUrl);
      if (!response2.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response2.status}: ${response2.statusText}`
        };
      }
      audioBuffer = Buffer.from(await response2.arrayBuffer());
      mimeType = response2.headers.get("content-type") || "audio/mpeg";
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
    const formData = new FormData();
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", audioBlob, filename);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    const prompt = options.prompt || (options.language ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}` : "Transcribe the user's voice to text");
    formData.append("prompt", prompt);
    const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
    const fullUrl = new URL(
      "v1/audio/transcriptions",
      baseUrl
    ).toString();
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "Accept-Encoding": "identity"
      },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
      };
    }
    const whisperResponse = await response.json();
    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format"
      };
    }
    return whisperResponse;
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}
function getFileExtension(mimeType) {
  const mimeToExt = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a"
  };
  return mimeToExt[mimeType] || "audio";
}
function getLanguageName(langCode) {
  const langMap = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "hi": "Hindi",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "sv": "Swedish",
    "da": "Danish",
    "no": "Norwegian",
    "fi": "Finnish"
  };
  return langMap[langCode] || langCode;
}

// server/_core/forex.ts
function sma(data, period) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}
function ema(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  let prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < data.length; i++) {
    prev = (data[i] - prev) * multiplier + prev;
    result.push(prev);
  }
  return result;
}
function rsi(data, period = 14) {
  const result = [];
  const gains = [];
  const losses = [];
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  if (gains.length < period) return result;
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i <= gains.length; i++) {
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}
function macd(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = ema(data, fastPeriod);
  const slowEma = ema(data, slowPeriod);
  const offset = slowPeriod - fastPeriod;
  const macdLine = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  const signalLine = ema(macdLine, signalPeriod);
  const histogramOffset = signalPeriod - 1;
  const histogram = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + histogramOffset] - signalLine[i]);
  }
  return { macdLine, signalLine, histogram };
}
function bollingerBands(data, period = 20, stdDev = 2) {
  const middle = sma(data, period);
  const upper = [];
  const lower = [];
  for (let i = 0; i < middle.length; i++) {
    const slice = data.slice(i, i + period);
    const mean4 = middle[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean4, 2), 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(mean4 + stdDev * sd);
    lower.push(mean4 - stdDev * sd);
  }
  return { upper, middle, lower };
}
function stochastic(highs, lows, closes2, kPeriod = 14, dPeriod = 3) {
  const kValues = [];
  for (let i = kPeriod - 1; i < closes2.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highest2 = Math.max(...highSlice);
    const lowest2 = Math.min(...lowSlice);
    const k = highest2 === lowest2 ? 50 : (closes2[i] - lowest2) / (highest2 - lowest2) * 100;
    kValues.push(k);
  }
  const dValues = sma(kValues, dPeriod);
  return { k: kValues, d: dValues };
}
function atr(data, period = 14) {
  const trValues = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
    trValues.push(tr);
  }
  if (trValues.length < period) return [];
  const result = [];
  let prev = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < trValues.length; i++) {
    prev = (prev * (period - 1) + trValues[i]) / period;
    result.push(prev);
  }
  return result;
}
function fibonacciRetracement(high, low) {
  const diff2 = high - low;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return ratios.map((r) => ({ level: `${(r * 100).toFixed(1)}%`, price: high - diff2 * r }));
}
function pivotPoints(high, low, close) {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp)
  };
}
function analyzeSentiment(closes2, highs, lows) {
  const signals = [];
  let weightedScore = 0;
  let totalWeight = 0;
  const last = closes2[closes2.length - 1];
  const rsiValues = rsi(closes2, 14);
  if (rsiValues.length > 0) {
    const rsiLast = rsiValues[rsiValues.length - 1];
    let signal;
    let score;
    if (rsiLast < 30) {
      signal = "Oversold - Potential Buy";
      score = 0.8;
    } else if (rsiLast < 40) {
      signal = "Approaching Oversold";
      score = 0.4;
    } else if (rsiLast > 70) {
      signal = "Overbought - Potential Sell";
      score = -0.8;
    } else if (rsiLast > 60) {
      signal = "Approaching Overbought";
      score = -0.4;
    } else {
      signal = "Neutral Zone";
      score = 0;
    }
    signals.push({ indicator: `RSI(${rsiLast.toFixed(1)})`, signal, weight: 2 });
    weightedScore += score * 2;
    totalWeight += 2;
  }
  const macdResult = macd(closes2);
  if (macdResult.histogram.length > 0) {
    const histLast = macdResult.histogram[macdResult.histogram.length - 1];
    const histPrev = macdResult.histogram[macdResult.histogram.length - 2];
    let signal;
    let score;
    if (histLast > 0 && histLast > histPrev) {
      signal = "Bullish Momentum Increasing";
      score = 0.7;
    } else if (histLast > 0) {
      signal = "Bullish Momentum";
      score = 0.3;
    } else if (histLast < 0 && histLast < histPrev) {
      signal = "Bearish Momentum Increasing";
      score = -0.7;
    } else {
      signal = "Bearish Momentum";
      score = -0.3;
    }
    signals.push({ indicator: "MACD", signal, weight: 2 });
    weightedScore += score * 2;
    totalWeight += 2;
  }
  const bb = bollingerBands(closes2);
  if (bb.upper.length > 0) {
    const upper = bb.upper[bb.upper.length - 1];
    const lower = bb.lower[bb.lower.length - 1];
    let signal;
    let score;
    if (last <= lower) {
      signal = "Price Below Lower Band - Buy Signal";
      score = 0.6;
    } else if (last >= upper) {
      signal = "Price Above Upper Band - Sell Signal";
      score = -0.6;
    } else {
      signal = "Price Within Bands";
      score = 0;
    }
    signals.push({ indicator: "Bollinger Bands", signal, weight: 1.5 });
    weightedScore += score * 1.5;
    totalWeight += 1.5;
  }
  const sma20 = sma(closes2, 20);
  const sma50 = sma(closes2, 50);
  if (sma20.length > 0 && sma50.length > 0) {
    const s20 = sma20[sma20.length - 1];
    const s50 = sma50[sma50.length - 1];
    let signal;
    let score;
    if (s20 > s50) {
      signal = "Golden Cross (SMA20 > SMA50)";
      score = 0.5;
    } else {
      signal = "Death Cross (SMA20 < SMA50)";
      score = -0.5;
    }
    signals.push({ indicator: "SMA Crossover", signal, weight: 1.5 });
    weightedScore += score * 1.5;
    totalWeight += 1.5;
  }
  if (highs.length === closes2.length && lows.length === closes2.length) {
    const stoch = stochastic(highs, lows, closes2);
    if (stoch.k.length > 0) {
      const kLast = stoch.k[stoch.k.length - 1];
      let signal;
      let score;
      if (kLast < 20) {
        signal = "Oversold";
        score = 0.6;
      } else if (kLast > 80) {
        signal = "Overbought";
        score = -0.6;
      } else {
        signal = "Neutral";
        score = 0;
      }
      signals.push({ indicator: `Stochastic(${kLast.toFixed(1)})`, signal, weight: 1 });
      weightedScore += score * 1;
      totalWeight += 1;
    }
  }
  const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  let label;
  if (normalizedScore > 0.5) label = "strong_buy";
  else if (normalizedScore > 0.15) label = "buy";
  else if (normalizedScore < -0.5) label = "strong_sell";
  else if (normalizedScore < -0.15) label = "sell";
  else label = "neutral";
  return { score: normalizedScore, label, signals };
}
function calculatePips(entryPrice, exitPrice, lotSize, pair = "EUR/USD", accountCurrency = "USD", exchangeRate = 1) {
  const isJpy = pair.toUpperCase().includes("JPY");
  const pipSize = isJpy ? 0.01 : 1e-4;
  const pips = (exitPrice - entryPrice) / pipSize;
  const direction = pips >= 0 ? "long" : "short";
  const pipValue = isJpy ? lotSize * 1e3 * pipSize * exchangeRate : lotSize * 1e5 * pipSize * exchangeRate;
  const profitLoss = Math.abs(pips) * pipValue * (pips >= 0 ? 1 : -1);
  return { pips: Math.abs(pips), pipValue, profitLoss, direction };
}
function calculateRisk(accountBalance, riskPercent, entryPrice, stopLossPrice, takeProfitPrice, pair = "EUR/USD") {
  const isJpy = pair.toUpperCase().includes("JPY");
  const pipSize = isJpy ? 0.01 : 1e-4;
  const riskAmount = accountBalance * (riskPercent / 100);
  const stopLossPips = Math.abs(entryPrice - stopLossPrice) / pipSize;
  const takeProfitPips = Math.abs(takeProfitPrice - entryPrice) / pipSize;
  const pipValue = isJpy ? 1e3 * pipSize : 1e5 * pipSize;
  const recommendedLotSize = stopLossPips > 0 ? riskAmount / (stopLossPips * pipValue) : 0;
  return {
    positionSize: recommendedLotSize,
    riskAmount,
    stopLossPips,
    takeProfitPips,
    riskRewardRatio: takeProfitPips / (stopLossPips || 1),
    recommendedLotSize: Math.min(recommendedLotSize, Math.floor(accountBalance / 1e3) * 0.1)
    // Cap at reasonable size
  };
}
function correlation(seriesA, seriesB) {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 2) return 0;
  const a = seriesA.slice(0, n);
  const b = seriesB.slice(0, n);
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}
function fullAnalysis(data, pair = "EUR/USD") {
  const closes2 = data.map((d) => d.close);
  const highs = data.map((d) => d.high);
  const lows = data.map((d) => d.low);
  const currentPrice = closes2[closes2.length - 1];
  const sma20Val = sma(closes2, 20);
  const sma50Val = sma(closes2, 50);
  const rsiVal = rsi(closes2, 14);
  const macdVal = macd(closes2);
  const bbVal = bollingerBands(closes2);
  const stochVal = stochastic(highs, lows, closes2);
  const atrVal = atr(data, 14);
  const fibVal = fibonacciRetracement(Math.max(...highs.slice(-100)), Math.min(...lows.slice(-100)));
  const pivotVal = pivotPoints(
    Math.max(...highs.slice(-1)),
    Math.min(...lows.slice(-1)),
    currentPrice
  );
  const sentimentVal = analyzeSentiment(closes2, highs, lows);
  const last = (arr) => arr.length > 0 ? arr[arr.length - 1] : null;
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    pair,
    currentPrice,
    indicators: {
      sma20: last(sma20Val),
      sma50: last(sma50Val),
      rsi: last(rsiVal),
      macd: { line: last(macdVal.macdLine), signal: last(macdVal.signalLine), histogram: last(macdVal.histogram) },
      bollingerBands: { upper: last(bbVal.upper), middle: last(bbVal.middle), lower: last(bbVal.lower) },
      stochastic: { k: last(stochVal.k), d: last(stochVal.d) },
      atr: last(atrVal)
    },
    fibonacci: fibVal,
    pivotPoints: { pp: pivotVal.pp, r1: pivotVal.r1, r2: pivotVal.r2, s1: pivotVal.s1, s2: pivotVal.s2 },
    sentiment: sentimentVal,
    support: Math.min(...lows.slice(-20)),
    resistance: Math.max(...highs.slice(-20))
  };
}

// server/_core/forexAdvanced.ts
var mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function adx(data, period = 14) {
  if (data.length <= period + 1) return { adx: [], plusDI: [], minusDI: [] };
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < data.length; i += 1) {
    const up = data[i].high - data[i - 1].high;
    const down = data[i - 1].low - data[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)));
  }
  const smoothed = (values) => {
    if (values.length < period) return [];
    const result = [mean(values.slice(0, period))];
    for (let i = period; i < values.length; i += 1) result.push((result[result.length - 1] * (period - 1) + values[i]) / period);
    return result;
  };
  const trS = smoothed(tr), plusS = smoothed(plusDM), minusS = smoothed(minusDM);
  const plusDI = [], minusDI = [], dx = [];
  for (let i = 0; i < trS.length; i += 1) {
    const p = trS[i] ? 100 * plusS[i] / trS[i] : 0;
    const m = trS[i] ? 100 * minusS[i] / trS[i] : 0;
    plusDI.push(p);
    minusDI.push(m);
    dx.push(p + m ? 100 * Math.abs(p - m) / (p + m) : 0);
  }
  return { adx: smoothed(dx), plusDI, minusDI };
}
function cci(data, period = 20) {
  const typical2 = data.map((bar) => (bar.high + bar.low + bar.close) / 3);
  const result = [];
  for (let i = period - 1; i < typical2.length; i += 1) {
    const window = typical2.slice(i - period + 1, i + 1);
    const average = mean(window);
    const deviation = mean(window.map((value) => Math.abs(value - average)));
    result.push(deviation ? (typical2[i] - average) / (0.015 * deviation) : 0);
  }
  return result;
}
function williamsR(data, period = 14) {
  const result = [];
  for (let i = period - 1; i < data.length; i += 1) {
    const window = data.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map((bar) => bar.high));
    const low = Math.min(...window.map((bar) => bar.low));
    result.push(high === low ? -50 : (high - data[i].close) / (high - low) * -100);
  }
  return result;
}
function obv(data) {
  if (!data.length) return [];
  const result = [0];
  for (let i = 1; i < data.length; i += 1) result.push(result[i - 1] + (data[i].close > data[i - 1].close ? data[i].volume : data[i].close < data[i - 1].close ? -data[i].volume : 0));
  return result;
}
function marketStructure(data, lookback = 3) {
  const swings = [];
  for (let i = lookback; i < data.length - lookback; i += 1) {
    const bar = data[i];
    const left = data.slice(i - lookback, i), right = data.slice(i + 1, i + lookback + 1);
    if (left.every((item) => bar.high >= item.high) && right.every((item) => bar.high >= item.high)) swings.push({ index: i, type: "swing-high", price: bar.high });
    if (left.every((item) => bar.low <= item.low) && right.every((item) => bar.low <= item.low)) swings.push({ index: i, type: "swing-low", price: bar.low });
  }
  const highs = swings.filter((swing) => swing.type === "swing-high").slice(-4);
  const lows = swings.filter((swing) => swing.type === "swing-low").slice(-4);
  const trend = highs.length >= 2 && lows.length >= 2 ? highs.at(-1).price > highs.at(-2).price && lows.at(-1).price > lows.at(-2).price ? "uptrend" : highs.at(-1).price < highs.at(-2).price && lows.at(-1).price < lows.at(-2).price ? "downtrend" : "range" : "insufficient-data";
  return { trend, swings, support: lows.length ? Math.min(...lows.map((item) => item.price)) : null, resistance: highs.length ? Math.max(...highs.map((item) => item.price)) : null };
}
function volatilityRegime(data, period = 14) {
  const closes2 = data.map((bar) => bar.close);
  const atrValues = atr(data, period);
  const returns = closes2.slice(1).map((close, index2) => Math.log(close / closes2[index2]));
  const realized = returns.length >= period ? Math.sqrt(mean(returns.slice(-period).map((value) => value ** 2))) : 0;
  const currentAtr = atrValues.at(-1) ?? 0;
  const baselineAtr = mean(atrValues.slice(-Math.min(50, atrValues.length)));
  const ratio = baselineAtr ? currentAtr / baselineAtr : 1;
  return { atr: currentAtr, realizedVolatility: realized, atrRatio: ratio, regime: ratio > 1.35 ? "expanding" : ratio < 0.75 ? "contracting" : "normal" };
}
function multiTimeframeConfluence(frames) {
  const analyses = frames.map((frame) => {
    const closes2 = frame.data.map((bar) => bar.close);
    const fast = ema(closes2, Math.min(20, Math.max(2, Math.floor(closes2.length / 4))));
    const slow = ema(closes2, Math.min(50, Math.max(3, Math.floor(closes2.length / 2))));
    const rsiValues = rsi(closes2, Math.min(14, Math.max(2, Math.floor(closes2.length / 5))));
    const lastClose = closes2.at(-1) ?? 0;
    const fastLast = fast.at(-1) ?? lastClose, slowLast = slow.at(-1) ?? lastClose;
    const score = clamp((fastLast > slowLast ? 1 : -1) + ((rsiValues.at(-1) ?? 50) - 50) / 50, -2, 2);
    return { timeframe: frame.timeframe, score, bias: score > 0.35 ? "bullish" : score < -0.35 ? "bearish" : "neutral", rsi: rsiValues.at(-1) ?? null, fastMA: fastLast, slowMA: slowLast };
  });
  const aggregate = analyses.length ? mean(analyses.map((analysis) => analysis.score)) : 0;
  return { analyses, aggregateScore: aggregate, consensus: aggregate > 0.35 ? "bullish" : aggregate < -0.35 ? "bearish" : "mixed" };
}
function forexSignalSnapshot(data, period = 14) {
  const closes2 = data.map((bar) => bar.close), highs = data.map((bar) => bar.high), lows = data.map((bar) => bar.low);
  const adxResult = adx(data, period), cciValues = cci(data, 20), wrValues = williamsR(data, period), obvValues = obv(data), stoch = stochastic(highs, lows, closes2, period, 3);
  const structure = marketStructure(data), volatility = volatilityRegime(data, period);
  const adxLast = adxResult.adx.at(-1) ?? 0, plus = adxResult.plusDI.at(-1) ?? 0, minus = adxResult.minusDI.at(-1) ?? 0;
  const score = clamp((plus > minus ? 0.35 : -0.35) + (adxLast > 25 ? plus > minus ? 0.25 : -0.25 : 0) + ((cciValues.at(-1) ?? 0) > 100 ? 0.2 : (cciValues.at(-1) ?? 0) < -100 ? -0.2 : 0) + ((wrValues.at(-1) ?? -50) > -20 ? -0.15 : (wrValues.at(-1) ?? -50) < -80 ? 0.15 : 0), -1, 1);
  return { score, bias: score > 0.2 ? "bullish" : score < -0.2 ? "bearish" : "neutral", trendStrength: adxLast, directionalMovement: { plusDI: plus, minusDI: minus }, cci: cciValues.at(-1) ?? null, williamsR: wrValues.at(-1) ?? null, obv: obvValues.at(-1) ?? 0, stochastic: { k: stoch.k.at(-1) ?? null, d: stoch.d.at(-1) ?? null }, structure, volatility, disclaimer: "This is an analytical snapshot, not a trade recommendation or guarantee of future results." };
}

// server/_core/technicalIndicators.ts
var closes = (data) => data.map((c) => c.close);
var avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
var trueRange = (data) => data.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - data[i - 1].close), Math.abs(c.low - data[i - 1].close)));
var sma3 = (values, period) => values.slice(-Math.max(1, period)).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(period, values.length));
var ema2 = (values, period) => {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let result = values[0];
  for (const value of values.slice(1)) result = value * k + result * (1 - k);
  return result;
};
var stdev = (values) => {
  const mean4 = avg(values);
  return Math.sqrt(avg(values.map((v) => (v - mean4) ** 2)));
};
var pct = (a, b) => b === 0 ? 0 : (a - b) / b * 100;
function smaIndicator(data, period = 20) {
  return { period, value: sma3(closes(data), period) };
}
function emaIndicator(data, period = 20) {
  return { period, value: ema2(closes(data), period) };
}
function wmaIndicator(data, period = 20) {
  const values = closes(data).slice(-period);
  const denom = values.length * (values.length + 1) / 2 || 1;
  return { period, value: values.reduce((sum, value, i) => sum + value * (i + 1), 0) / denom };
}
function hmaIndicator(data, period = 20) {
  const half = Math.max(2, Math.floor(period / 2));
  const wmaHalf = wmaIndicator(data, half).value;
  const wmaFull = wmaIndicator(data, period).value;
  return { period, value: 2 * wmaHalf - wmaFull };
}
function macdIndicator(data, fast = 12, slow = 26, signal = 9) {
  const values = closes(data);
  const macd3 = ema2(values, fast) - ema2(values, slow);
  return { fast, slow, signal, macd: macd3, signalLine: ema2(values.slice(-signal).map((_, i, a) => ema2(values.slice(0, values.length - signal + i + 1), fast) - ema2(values.slice(0, values.length - signal + i + 1), slow)), signal), histogram: macd3 - ema2(values.slice(-signal).map((_, i, a) => ema2(values.slice(0, values.length - signal + i + 1), fast) - ema2(values.slice(0, values.length - signal + i + 1), slow)), signal) };
}
function stochasticIndicator(data, period = 14, smooth = 3) {
  const sample = data.slice(-period);
  const high = Math.max(...sample.map((c) => c.high), 0);
  const low = Math.min(...sample.map((c) => c.low), 0);
  const close = sample.at(-1)?.close ?? 0;
  const k = high === low ? 50 : (close - low) / (high - low) * 100;
  return { period, smooth, k, d: k };
}
function atrIndicator(data, period = 14) {
  return { period, value: sma3(trueRange(data), period) };
}
function bollingerIndicator(data, period = 20, multiplier = 2) {
  const values = closes(data).slice(-period);
  const middle = avg(values);
  const deviation = stdev(values);
  return { period, multiplier, middle, upper: middle + multiplier * deviation, lower: middle - multiplier * deviation, bandwidth: middle === 0 ? 0 : 2 * multiplier * deviation / middle * 100 };
}
function keltnerIndicator(data, period = 20, multiplier = 2) {
  const middle = ema2(closes(data), period);
  const atr4 = atrIndicator(data, Math.min(period, 14)).value;
  return { period, multiplier, middle, upper: middle + multiplier * atr4, lower: middle - multiplier * atr4 };
}
function donchianIndicator(data, period = 20) {
  const sample = data.slice(-period);
  return { period, upper: Math.max(...sample.map((c) => c.high), 0), lower: Math.min(...sample.map((c) => c.low), 0), middle: avg([Math.max(...sample.map((c) => c.high), 0), Math.min(...sample.map((c) => c.low), 0)]) };
}
function rocIndicator(data, period = 12) {
  const values = closes(data);
  return { period, value: pct(values.at(-1) ?? 0, values[Math.max(0, values.length - 1 - period)] ?? 0) };
}
function momentumIndicator(data, period = 10) {
  const values = closes(data);
  return { period, value: (values.at(-1) ?? 0) - (values[Math.max(0, values.length - 1 - period)] ?? 0) };
}
function mfiIndicator(data, period = 14) {
  const sample = data.slice(-(period + 1));
  let positive = 0;
  let negative = 0;
  sample.slice(1).forEach((c, i) => {
    const prev = sample[i];
    const flow = (c.high + c.low + c.close) / 3 * c.volume;
    if (c.close >= prev.close) positive += flow;
    else negative += flow;
  });
  const ratio = negative === 0 ? 100 : positive / negative;
  return { period, value: 100 - 100 / (1 + ratio) };
}
function obvIndicator(data) {
  let value = 0;
  data.slice(1).forEach((c, i) => {
    if (c.close > data[i].close) value += c.volume;
    else if (c.close < data[i].close) value -= c.volume;
  });
  return { value };
}
function vwapIndicator(data) {
  let pv = 0;
  let volume = 0;
  for (const c of data) {
    pv += (c.high + c.low + c.close) / 3 * c.volume;
    volume += c.volume;
  }
  return { value: volume ? pv / volume : 0 };
}
function adxIndicator(data, period = 14) {
  const trs = trueRange(data);
  const plus = [];
  const minus = [];
  for (let i = 1; i < data.length; i++) {
    const up = data[i].high - data[i - 1].high;
    const down = data[i - 1].low - data[i].low;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const atr4 = sma3(trs, period) || 1;
  const pdi = sma3(plus, period) / atr4 * 100;
  const mdi = sma3(minus, period) / atr4 * 100;
  return { period, plusDI: pdi, minusDI: mdi, adx: pdi + mdi === 0 ? 0 : Math.abs(pdi - mdi) / (pdi + mdi) * 100 };
}
function cmoIndicator(data, period = 14) {
  const changes = closes(data).slice(1).map((v, i) => v - closes(data)[i]).slice(-period);
  const up = changes.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const down = Math.abs(changes.filter((v) => v < 0).reduce((a, b) => a + b, 0));
  return { period, value: up + down === 0 ? 0 : (up - down) / (up + down) * 100 };
}
function ulcerIndexIndicator(data, period = 14) {
  const sample = closes(data).slice(-period);
  const max = Math.max(...sample, 0);
  const squared = sample.map((v) => ((v - max) / (max || 1) * 100) ** 2);
  return { period, value: Math.sqrt(avg(squared)) };
}
function zScoreIndicator(data, period = 20) {
  const sample = closes(data).slice(-period);
  const mean4 = avg(sample);
  const deviation = stdev(sample);
  return { period, value: deviation === 0 ? 0 : ((sample.at(-1) ?? 0) - mean4) / deviation };
}
function realizedVolatilityIndicator(data, period = 20) {
  const values = closes(data).slice(-period);
  const returns = values.slice(1).map((v, i) => Math.log(v / (values[i] || v)));
  return { period, value: stdev(returns) * Math.sqrt(252) * 100 };
}
function heikinAshiIndicator(data) {
  let previousOpen = data[0]?.open ?? 0;
  let previousClose = data[0]?.close ?? 0;
  const result = data.map((c) => {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = (previousOpen + previousClose) / 2;
    previousOpen = open;
    previousClose = close;
    return { open, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), close };
  });
  return result.at(-1) ?? { open: 0, high: 0, low: 0, close: 0 };
}
function pivotRangeIndicator(data) {
  const c = data.at(-1);
  if (!c) return { top: 0, bottom: 0, width: 0 };
  const pivot = (c.high + c.low + c.close) / 3;
  const bottom = (c.high + c.low) / 2;
  const top = 2 * pivot - bottom;
  return { top, bottom, width: top - bottom };
}
function ichimokuCloudIndicator(data, conversionPeriod = 9, basePeriod = 26, spanPeriod = 52, displacement = 26) {
  const midpoint = (period, offset = 0) => {
    const sample = data.slice(Math.max(0, data.length - period - offset), Math.max(0, data.length - offset));
    if (!sample.length) return 0;
    return (Math.max(...sample.map((c) => c.high)) + Math.min(...sample.map((c) => c.low))) / 2;
  };
  const conversion = midpoint(conversionPeriod);
  const base = midpoint(basePeriod);
  const spanA = (conversion + base) / 2;
  const spanB = midpoint(spanPeriod);
  const close = data.at(-1)?.close ?? 0;
  return { conversionPeriod, basePeriod, spanPeriod, displacement, conversion, base, spanA, spanB, cloudTop: Math.max(spanA, spanB), cloudBottom: Math.min(spanA, spanB), close, bias: close > Math.max(spanA, spanB) ? "above-cloud" : close < Math.min(spanA, spanB) ? "below-cloud" : "inside-cloud" };
}
function fibonacciRetracementIndicator(data, lookback = 100) {
  const sample = data.slice(-Math.max(2, lookback));
  if (!sample.length) return { lookback, high: 0, low: 0, range: 0, trend: "flat", levels: {} };
  const high = Math.max(...sample.map((c) => c.high));
  const low = Math.min(...sample.map((c) => c.low));
  const range = high - low;
  const first = sample[0]?.close ?? 0;
  const last = sample.at(-1)?.close ?? 0;
  const trend = last >= first ? "up" : "down";
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels = Object.fromEntries(ratios.map((ratio) => [String(ratio), trend === "up" ? high - range * ratio : low + range * ratio]));
  return { lookback, high, low, range, trend, levels };
}
function superTrendIndicator(data, period = 10, multiplier = 3) {
  if (!data.length) return { period, multiplier, value: 0, direction: "neutral", upperBand: 0, lowerBand: 0 };
  const safePeriod = Math.max(1, period);
  const trs = trueRange(data);
  let finalUpper = 0;
  let finalLower = 0;
  let direction = "up";
  let value = data[0].close;
  for (let i = 0; i < data.length; i++) {
    const atr4 = sma3(trs.slice(0, i + 1), safePeriod);
    const hl2 = (data[i].high + data[i].low) / 2;
    const basicUpper = hl2 + multiplier * atr4;
    const basicLower = hl2 - multiplier * atr4;
    finalUpper = i === 0 ? basicUpper : basicUpper < finalUpper || data[i - 1].close > finalUpper ? basicUpper : finalUpper;
    finalLower = i === 0 ? basicLower : basicLower > finalLower || data[i - 1].close < finalLower ? basicLower : finalLower;
    if (direction === "up" && data[i].close < finalLower) direction = "down";
    else if (direction === "down" && data[i].close > finalUpper) direction = "up";
    value = direction === "up" ? finalLower : finalUpper;
  }
  return { period: safePeriod, multiplier, value, direction, upperBand: finalUpper, lowerBand: finalLower };
}
function indicatorSuite(data, requested) {
  const names = requested?.length ? requested : ["sma", "ema", "macd", "rsi", "bollinger", "atr", "adx", "stochastic", "vwap", "obv", "mfi", "donchian", "roc", "zscore", "volatility"];
  const output = {};
  for (const name of names) {
    switch (name) {
      case "sma":
        output.sma = smaIndicator(data);
        break;
      case "ema":
        output.ema = emaIndicator(data);
        break;
      case "wma":
        output.wma = wmaIndicator(data);
        break;
      case "hma":
        output.hma = hmaIndicator(data);
        break;
      case "macd":
        output.macd = macdIndicator(data);
        break;
      case "rsi":
        output.rsi = rsiValue(data);
        break;
      case "bollinger":
        output.bollinger = bollingerIndicator(data);
        break;
      case "keltner":
        output.keltner = keltnerIndicator(data);
        break;
      case "donchian":
        output.donchian = donchianIndicator(data);
        break;
      case "stochastic":
        output.stochastic = stochasticIndicator(data);
        break;
      case "atr":
        output.atr = atrIndicator(data);
        break;
      case "adx":
        output.adx = adxIndicator(data);
        break;
      case "mfi":
        output.mfi = mfiIndicator(data);
        break;
      case "obv":
        output.obv = obvIndicator(data);
        break;
      case "vwap":
        output.vwap = vwapIndicator(data);
        break;
      case "roc":
        output.roc = rocIndicator(data);
        break;
      case "momentum":
        output.momentum = momentumIndicator(data);
        break;
      case "cmo":
        output.cmo = cmoIndicator(data);
        break;
      case "ulcer":
        output.ulcer = ulcerIndexIndicator(data);
        break;
      case "zscore":
        output.zscore = zScoreIndicator(data);
        break;
      case "volatility":
        output.volatility = realizedVolatilityIndicator(data);
        break;
      case "heikinAshi":
        output.heikinAshi = heikinAshiIndicator(data);
        break;
      case "pivotRange":
        output.pivotRange = pivotRangeIndicator(data);
        break;
      case "awesomeOscillator":
        output.awesomeOscillator = awesomeOscillatorIndicator(data);
        break;
      case "forceIndex":
        output.forceIndex = forceIndexIndicator(data);
        break;
      case "cmf":
        output.cmf = chaikinMoneyFlowIndicator(data);
        break;
      case "vortex":
        output.vortex = vortexIndicator(data);
        break;
      case "fisher":
        output.fisher = fisherTransformIndicator(data);
        break;
      case "rvi":
        output.rvi = relativeVigorIndexIndicator(data);
        break;
      case "massIndex":
        output.massIndex = massIndexIndicator(data);
        break;
      case "chandelier":
        output.chandelier = chandelierExitIndicator(data);
        break;
      case "ichimoku":
        output.ichimoku = ichimokuCloudIndicator(data);
        break;
      case "fibonacci":
        output.fibonacci = fibonacciRetracementIndicator(data);
        break;
      case "supertrend":
        output.supertrend = superTrendIndicator(data);
        break;
      default:
        output[name] = { error: "Unknown indicator" };
    }
  }
  return output;
}
function rsiValue(data, period = 14) {
  const values = closes(data);
  const changes = values.slice(1).map((v, i) => v - values[i]);
  const recent = changes.slice(-period);
  const gains = avg(recent.map((v) => Math.max(v, 0)));
  const losses = avg(recent.map((v) => Math.max(-v, 0)));
  return { period, value: losses === 0 ? 100 : 100 - 100 / (1 + gains / losses) };
}
function awesomeOscillatorIndicator(data, fast = 5, slow = 34) {
  const median = data.map((c) => (c.high + c.low) / 2);
  return { fast, slow, value: sma3(median, fast) - sma3(median, slow) };
}
function forceIndexIndicator(data, period = 13) {
  const values = data.slice(1).map((c, i) => (c.close - data[i].close) * c.volume);
  return { period, value: ema2(values, period) };
}
function chaikinMoneyFlowIndicator(data, period = 20) {
  const sample = data.slice(-period);
  const volume = sample.reduce((s, c) => s + c.volume, 0);
  const flow = sample.reduce((s, c) => s + (c.high === c.low ? 0 : (2 * c.close - c.low - c.high) / (c.high - c.low) * c.volume), 0);
  return { period, value: volume ? flow / volume : 0 };
}
function vortexIndicator(data, period = 14) {
  let plus = 0;
  let minus = 0;
  let tr = 0;
  for (let i = Math.max(1, data.length - period); i < data.length; i++) {
    plus += Math.abs(data[i].high - data[i - 1].low);
    minus += Math.abs(data[i].low - data[i - 1].high);
    tr += trueRange(data)[i];
  }
  return { period, plus: tr ? plus / tr : 0, minus: tr ? minus / tr : 0 };
}
function fisherTransformIndicator(data, period = 10) {
  const sample = data.slice(-period);
  const high = Math.max(...sample.map((c) => c.high), 0);
  const low = Math.min(...sample.map((c) => c.low), 0);
  const price = (sample.at(-1)?.high ?? 0 + (sample.at(-1)?.low ?? 0)) / 2;
  const normalized = Math.max(-0.999, Math.min(0.999, high === low ? 0 : 2 * ((price - low) / (high - low) - 0.5)));
  return { period, value: 0.5 * Math.log((1 + normalized) / (1 - normalized)) };
}
function relativeVigorIndexIndicator(data, period = 10) {
  const sample = data.slice(-period);
  const numerator = avg(sample.map((c) => c.close - c.open));
  const denominator = avg(sample.map((c) => c.high - c.low));
  return { period, value: denominator === 0 ? 0 : numerator / denominator };
}
function massIndexIndicator(data, period = 25) {
  const ranges = data.map((c) => c.high - c.low);
  const ema1 = ranges.map((_, i) => ema2(ranges.slice(0, i + 1), 9));
  const ema22 = ema1.map((_, i) => ema2(ema1.slice(0, i + 1), 9));
  return { period, value: avg(ema22.slice(-period).map((v, i) => v === 0 ? 0 : ema1.slice(-period)[i] / v)) * period };
}
function chandelierExitIndicator(data, period = 22, multiplier = 3) {
  const sample = data.slice(-period);
  const atr4 = atrIndicator(data, Math.min(14, period)).value;
  return { period, multiplier, long: Math.max(...sample.map((c) => c.high), 0) - atr4 * multiplier, short: Math.min(...sample.map((c) => c.low), 0) + atr4 * multiplier };
}

// server/_core/musicPro.ts
var SCALE_INTERVALS = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10] };
function scaleNotes(root = 60, scale = "major", octaves = 2) {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  return Array.from({ length: Math.max(1, octaves) }, (_, octave) => intervals.map((interval) => root + octave * 12 + interval)).flat();
}
function chordExtensions(root, quality = "major", extensions = [7, 9]) {
  const base = quality === "minor" ? [0, 3, 7] : quality === "dominant" ? [0, 4, 7, 10] : quality === "diminished" ? [0, 3, 6] : [0, 4, 7];
  const extra = extensions.map((extension) => extension === 7 ? quality === "major" ? 11 : 10 : extension === 9 ? 14 : extension === 11 ? 17 : 21);
  return [...base, ...extra].map((interval) => root + interval);
}
function quantizeNotes(events, grid = 0.25, strength = 1) {
  const safeGrid = Math.max(1e-3, grid);
  return events.map((event) => ({ ...event, start: event.start + (Math.round(event.start / safeGrid) * safeGrid - event.start) * Math.max(0, Math.min(1, strength)) }));
}
function euclideanRhythm(steps, pulses, rotation = 0) {
  const n = Math.max(1, Math.floor(steps));
  const k = Math.max(0, Math.min(n, Math.floor(pulses)));
  const pattern = Array.from({ length: n }, (_, i) => Math.floor(i * k / n) !== Math.floor((i - 1 + n) % n * k / n));
  const shift = (rotation % n + n) % n;
  return pattern.map((_, i) => pattern[(i - shift + n) % n]);
}
function drumGrid(steps = 16, density = 0.5, seed = 7) {
  const safeSteps = Math.max(1, Math.min(128, Math.floor(steps)));
  let state = Math.abs(seed) || 7;
  const next = () => {
    state = state * 1664525 + 1013904223 >>> 0;
    return state / 4294967296;
  };
  return { kick: Array.from({ length: safeSteps }, (_, i) => i % 4 === 0 || next() < density * 0.12), snare: Array.from({ length: safeSteps }, (_, i) => i % 8 === 4 || next() < density * 0.05), hat: Array.from({ length: safeSteps }, () => next() < Math.min(0.98, density + 0.25)) };
}
function shapeAutomation(points, curve = "linear", samples = points.length) {
  const source = points.length ? points : [0, 1];
  const count = Math.max(2, samples);
  const at = (t2) => {
    const scaled = t2 * (source.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(source.length - 1, left + 1);
    const local = scaled - left;
    let eased = local;
    if (curve === "ease-in") eased = local * local;
    if (curve === "ease-out") eased = 1 - (1 - local) * (1 - local);
    if (curve === "sine") eased = (1 - Math.cos(local * Math.PI)) / 2;
    return source[left] + (source[right] - source[left]) * eased;
  };
  return Array.from({ length: count }, (_, i) => at(i / (count - 1)));
}
function chordProgression(root = 60, quality = "major", degrees = [1, 5, 6, 4]) {
  const scale = scaleNotes(root, quality === "minor" ? "minor" : "major", 3);
  return degrees.map((degree) => scale[Math.max(0, degree - 1)] ?? root).map((note) => [note, note + (quality === "minor" ? 3 : 4), note + 7]);
}
function arpeggiate(notes, pattern = "up", octaves = 1) {
  const source = notes.length ? notes : [60, 64, 67];
  const order = pattern === "down" ? [...source].reverse() : pattern === "updown" ? [...source, ...source.slice(1, -1).reverse()] : source;
  return Array.from({ length: Math.max(1, octaves) }, (_, octave) => order.map((note) => note + octave * 12)).flat();
}
function swingQuantize(events, grid = 0.25, swing = 0.5) {
  const safeSwing = Math.max(0, Math.min(0.99, swing));
  return events.map((event) => {
    const slot = Math.round(event.start / Math.max(1e-3, grid));
    const offset = slot % 2 ? grid * (safeSwing - 0.5) : 0;
    return { ...event, start: Math.max(0, slot * grid + offset) };
  });
}
function humanizeNotes(events, timing = 0.01, velocity = 5, seed = 17) {
  let state = Math.abs(seed) || 17;
  const next = () => {
    state = state * 1664525 + 1013904223 >>> 0;
    return state / 4294967296 - 0.5;
  };
  return events.map((event) => ({ ...event, start: Math.max(0, event.start + next() * timing), velocity: Math.max(1, Math.min(127, Math.round(event.velocity + next() * velocity))) }));
}
function velocityCurve(events, curve = "linear") {
  if (!events.length) return [];
  const max = Math.max(...events.map((e) => e.velocity), 1);
  return events.map((event, i) => {
    const t2 = events.length === 1 ? 1 : i / (events.length - 1);
    const shaped = curve === "ease-in" ? t2 * t2 : curve === "ease-out" ? 1 - (1 - t2) ** 2 : t2;
    return { ...event, velocity: Math.max(1, Math.min(127, Math.round(event.velocity * 0.5 + max * shaped * 0.5))) };
  });
}
function midiNoteName(note) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const safe = Math.round(note);
  return `${names[(safe % 12 + 12) % 12]}${Math.floor(safe / 12) - 1}`;
}

// server/_core/marketScreening.ts
function screenMarketAssets(assets, requestedIndicators) {
  return assets.slice(0, 100).map((asset) => {
    if (!asset.candles.length) return { symbol: asset.symbol, assetClass: asset.assetClass, asOf: asset.asOf ?? (/* @__PURE__ */ new Date()).toISOString(), score: 0, bias: "neutral", factors: {}, caveats: ["No OHLCV candles were supplied"] };
    const indicators = indicatorSuite(asset.candles, requestedIndicators ?? ["sma", "ema", "rsi", "adx", "vwap", "volatility", "zscore"]);
    const close = asset.candles.at(-1)?.close ?? 0;
    const sma6 = Number(indicators.sma?.value ?? close);
    const ema5 = Number(indicators.ema?.value ?? close);
    const rsi4 = Number(indicators.rsi?.value ?? 50);
    const adx3 = Number(indicators.adx?.adx ?? 0);
    const vwap2 = Number(indicators.vwap?.value ?? close);
    const zscore = Number(indicators.zscore?.value ?? 0);
    const trend = close >= sma6 && close >= ema5 ? 1 : close <= sma6 && close <= ema5 ? -1 : 0;
    const momentum = rsi4 >= 55 ? 1 : rsi4 <= 45 ? -1 : 0;
    const participation = close >= vwap2 ? 1 : -1;
    const score = Math.max(-1, Math.min(1, (trend * 0.35 + momentum * 0.3 + participation * 0.2 + Math.sign(zscore) * 0.15) * Math.min(1, 0.35 + adx3 / 100)));
    const bias = score > 0.2 ? "bullish" : score < -0.2 ? "bearish" : "neutral";
    return { symbol: asset.symbol, assetClass: asset.assetClass, asOf: asset.asOf ?? (/* @__PURE__ */ new Date()).toISOString(), score, bias, factors: { trend, momentum, participation, adx: adx3, rsi: rsi4, zscore }, caveats: ["Screening is descriptive, not a forecast", "Results depend on candle quality, timeframe, fees, liquidity, and regime", asset.assetClass === "crypto" ? "Crypto markets can trade continuously and exhibit elevated gap/liquidity risk" : "Equity data may be exchange-session dependent"] };
  }).sort((a, b) => b.score - a.score);
}
function marketScreenSummary(results) {
  const bullish = results.filter((r) => r.bias === "bullish").length;
  const bearish = results.filter((r) => r.bias === "bearish").length;
  return { count: results.length, bullish, bearish, neutral: results.length - bullish - bearish, leaders: results.slice(0, 5).map((r) => ({ symbol: r.symbol, score: r.score, bias: r.bias })), generatedAt: (/* @__PURE__ */ new Date()).toISOString(), disclaimer: "This is a research screen, not investment advice or an execution signal." };
}

// server/_core/synthTools.ts
var clamp2 = (value, min, max) => Math.max(min, Math.min(max, value));
function normalizeSynthPatch(patch) {
  return {
    ...patch,
    tempo: clamp2(patch.tempo, 20, 300),
    oscillators: patch.oscillators.map((oscillator) => ({
      ...oscillator,
      octave: clamp2(oscillator.octave, -4, 4),
      semitones: clamp2(oscillator.semitones, -24, 24),
      fine: clamp2(oscillator.fine, -100, 100),
      unison: clamp2(Math.round(oscillator.unison), 1, 16),
      detune: clamp2(oscillator.detune, 0, 1),
      level: clamp2(oscillator.level, 0, 1),
      pan: clamp2(oscillator.pan, -1, 1)
    })),
    filter: { ...patch.filter, cutoffHz: clamp2(patch.filter.cutoffHz, 20, 2e4), resonance: clamp2(patch.filter.resonance, 0, 1), drive: clamp2(patch.filter.drive, 0, 1), keytrack: clamp2(patch.filter.keytrack, 0, 1) },
    envelopes: {
      amp: { ...patch.envelopes.amp, attack: Math.max(0, patch.envelopes.amp.attack), decay: Math.max(0, patch.envelopes.amp.decay), sustain: clamp2(patch.envelopes.amp.sustain, 0, 1), release: Math.max(0, patch.envelopes.amp.release) },
      filter: { ...patch.envelopes.filter, attack: Math.max(0, patch.envelopes.filter.attack), decay: Math.max(0, patch.envelopes.filter.decay), sustain: clamp2(patch.envelopes.filter.sustain, 0, 1), release: Math.max(0, patch.envelopes.filter.release), amount: clamp2(patch.envelopes.filter.amount, -1, 1) }
    }
  };
}
function createSerumStylePatch(input) {
  const mood = input.mood ?? "bright";
  const presets = {
    dark: { cutoffHz: 850, resonance: 0.62, drive: 0.48, reverb: 0.18, distortion: 0.34, attack: 0.01, release: 0.42 },
    bright: { cutoffHz: 5200, resonance: 0.2, drive: 0.1, reverb: 0.3, distortion: 0.08, attack: 5e-3, release: 0.8 },
    aggressive: { cutoffHz: 2200, resonance: 0.78, drive: 0.72, reverb: 0.12, distortion: 0.65, attack: 1e-3, release: 0.25 },
    organic: { cutoffHz: 3400, resonance: 0.24, drive: 0.08, reverb: 0.45, distortion: 0.04, attack: 0.02, release: 1.2 },
    ambient: { cutoffHz: 1900, resonance: 0.35, drive: 0.05, reverb: 0.72, distortion: 0.02, attack: 0.8, release: 3.5 }
  }[mood];
  const preset = presets;
  const patch = {
    name: input.name,
    genre: input.genre ?? "electronic",
    tempo: input.tempo ?? 128,
    oscillators: [
      { id: "osc-a", wave: "wavetable", wavetable: input.wavetable ?? "Basic Shapes", octave: 0, semitones: 0, fine: 0, unison: mood === "ambient" ? 4 : 2, detune: 0.08, level: 0.85, pan: 0 },
      { id: "osc-b", wave: "saw", octave: -1, semitones: 0, fine: mood === "dark" ? -7 : 7, unison: 1, detune: 0, level: 0.45, pan: 0 }
    ],
    noise: { type: mood === "organic" ? "vinyl" : "white", level: mood === "ambient" ? 0.08 : 0.03 },
    filter: { type: "lowpass", cutoffHz: preset.cutoffHz, resonance: preset.resonance, drive: preset.drive, keytrack: 0.35 },
    envelopes: { amp: { attack: preset.attack, decay: 0.45, sustain: mood === "aggressive" ? 0.72 : 0.85, release: preset.release }, filter: { attack: 0.01, decay: 0.55, sustain: 0.25, release: 0.6, amount: mood === "bright" ? 0.45 : 0.72 } },
    lfos: [{ id: "lfo-1", shape: "sine", rateHz: 5.2, synced: "1/8", amount: mood === "ambient" ? 0.12 : 0.06 }, { id: "lfo-2", shape: "triangle", rateHz: 0.3, synced: "2 bars", amount: 0.18 }],
    modulation: [{ source: "env-filter", destination: "filter.cutoff", amount: mood === "aggressive" ? 0.82 : 0.58, curve: "exponential" }, { source: "lfo-1", destination: "osc-a.wavetablePosition", amount: 0.18, curve: "linear" }, { source: "velocity", destination: "filter.cutoff", amount: 0.22, curve: "linear" }],
    effects: [{ type: "distortion", mix: preset.distortion, parameters: { mode: "soft-clipping", drive: preset.drive } }, { type: "compressor", mix: 0.42, parameters: { threshold: -18, ratio: 3.5, attack: 8, release: 90 } }, { type: "delay", mix: mood === "ambient" ? 0.28 : 0.12, parameters: { time: "1/4", feedback: 0.28, width: 0.7 } }, { type: "reverb", mix: preset.reverb, parameters: { size: mood === "ambient" ? 0.95 : 0.62, damping: 0.35 } }],
    macroControls: [{ name: "Movement", mappings: [{ destination: "lfo-1.amount", min: 0, max: 0.6 }, { destination: "filter.cutoff", min: preset.cutoffHz * 0.4, max: Math.min(18e3, preset.cutoffHz * 2.5) }] }, { name: "Impact", mappings: [{ destination: "distortion.mix", min: 0, max: 0.8 }, { destination: "env-filter.amount", min: 0.1, max: 1 }] }],
    tags: [mood, input.genre ?? "electronic", "serum-style", input.rootNote ?? "C"],
    notes: ["Designed as a synth patch specification for Xfer Serum-style routing.", "Map oscillator, filter, envelope, LFO, macro, and effect fields into a DAW/plugin adapter.", "Use the normalized output as a reproducible starting point rather than a proprietary preset file."]
  };
  return normalizeSynthPatch(patch);
}
function analyzeSynthPatch(patch) {
  const normalized = normalizeSynthPatch(patch);
  const brightness = clamp2(normalized.filter.cutoffHz / 12e3 + normalized.filter.resonance * 0.2, 0, 1);
  const movement = clamp2(normalized.lfos.reduce((sum, lfo) => sum + lfo.amount, 0) / Math.max(1, normalized.lfos.length), 0, 1);
  const density = clamp2(normalized.oscillators.length / 4 + normalized.oscillators.reduce((sum, oscillator) => sum + oscillator.unison, 0) / 32, 0, 1);
  const risks = [
    normalized.filter.resonance > 0.85 ? "High resonance may create sharp peaks; monitor headroom." : null,
    normalized.effects.some((effect) => effect.type === "reverb" && effect.mix > 0.7) ? "Large reverb mix may mask transients." : null,
    normalized.oscillators.some((oscillator) => oscillator.unison > 8) ? "High unison can create phase and CPU pressure." : null
  ].filter((value) => Boolean(value));
  return { brightness, movement, density, spectralCharacter: brightness > 0.7 ? "bright" : brightness < 0.3 ? "dark" : "balanced", risks };
}
function createModulationMatrix(patch) {
  return patch.modulation.map((route, index2) => ({ id: `route-${index2 + 1}`, ...route, normalizedAmount: clamp2(Math.abs(route.amount), 0, 1) }));
}

// server/_core/toolRegistry.ts
var TOOL_POLICIES = {
  calculator: { name: "calculator", description: "Evaluate safe arithmetic expressions.", risk: "compute", allowedAgents: "all", maxCallsPerMinute: 120, failureThreshold: 0.6, minimumSamples: 10, cooldownMs: 15e3 },
  text_analysis: { name: "text_analysis", description: "Analyze text statistics and sentiment.", risk: "compute", allowedAgents: "all", maxCallsPerMinute: 60, failureThreshold: 0.6, minimumSamples: 10, cooldownMs: 15e3 },
  code_execution: { name: "code_execution", description: "Execute agent-provided code in the existing sandbox pathway.", risk: "code", allowedAgents: ["code_reviewer", "data_analyst", "math_tutor"], maxCallsPerMinute: 20, failureThreshold: 0.35, minimumSamples: 5, cooldownMs: 3e4 },
  data_processing: { name: "data_processing", description: "Transform and summarize structured data.", risk: "compute", allowedAgents: "all", maxCallsPerMinute: 60, failureThreshold: 0.6, minimumSamples: 10, cooldownMs: 15e3 },
  web_search: { name: "web_search", description: "Request current web research.", risk: "external", allowedAgents: ["forex_analyst", "research_agent", "brainstormer"], maxCallsPerMinute: 30, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 2e4 },
  forex_signal_snapshot: { name: "forex_signal_snapshot", description: "Compute advanced forex indicators and a non-guaranteed snapshot.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager"], maxCallsPerMinute: 30, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 2e4 },
  forex_multi_timeframe: { name: "forex_multi_timeframe", description: "Calculate timeframe confluence.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager"], maxCallsPerMinute: 20, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 2e4 },
  create_synth_patch: { name: "create_synth_patch", description: "Generate a Serum/Xfer-style engine-neutral synth patch.", risk: "compute", allowedAgents: ["music_composer", "sound_designer", "brainstormer", "music_producer", "audio_engineer"], maxCallsPerMinute: 30, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 15e3 },
  advanced_market_structure: { name: "advanced_market_structure", description: "Compute pivots, Fibonacci, Ichimoku, Supertrend, divergence, volume profile, and confluence.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager", "market_microstructure"], maxCallsPerMinute: 20, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 2e4 },
  music_quantize: { name: "music_quantize", description: "Quantize note events to a bounded musical grid.", risk: "compute", allowedAgents: ["music_composer", "music_producer", "audio_engineer"], maxCallsPerMinute: 60, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 15e3 },
  music_rhythm: { name: "music_rhythm", description: "Generate deterministic Euclidean and drum-grid patterns.", risk: "compute", allowedAgents: ["music_composer", "music_producer", "audio_engineer"], maxCallsPerMinute: 60, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 15e3 },
  persistent_remember: { name: "persistent_remember", description: "Persist scoped memory with embeddings and retention metadata.", risk: "external", allowedAgents: ["memory_architect", "automation_orchestrator"], maxCallsPerMinute: 30, failureThreshold: 0.4, minimumSamples: 5, cooldownMs: 3e4 },
  persistent_recall: { name: "persistent_recall", description: "Recall durable memories using scoped cosine similarity.", risk: "external", allowedAgents: ["memory_architect", "ml_engineer", "automation_orchestrator"], maxCallsPerMinute: 60, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 2e4 },
  technical_indicator_suite: { name: "technical_indicator_suite", description: "Compute a bounded suite of deterministic technical-analysis indicators.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager", "market_microstructure", "data_analyst", "ui_architect", "multimodal_curator"], maxCallsPerMinute: 30, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 2e4 },
  agentic_workflow_plan: { name: "agentic_workflow_plan", description: "Create a safe role-aware workflow plan with verification and rollback gates.", risk: "compute", allowedAgents: ["brainstormer", "research_agent", "automation_orchestrator", "qa_engineer", "ui_architect", "multimodal_curator", "observability_engineer", "security_reviewer"], maxCallsPerMinute: 30, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 15e3 },
  advanced_music_arrangement: { name: "advanced_music_arrangement", description: "Generate bounded chord, arpeggio, swing, humanization, velocity, and MIDI-note outputs.", risk: "compute", allowedAgents: ["music_composer", "music_producer", "audio_engineer", "sound_designer", "brainstormer"], maxCallsPerMinute: 60, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 15e3 },
  market_screening_snapshot: { name: "market_screening_snapshot", description: "Screen supplied crypto or stock OHLCV assets with deterministic indicators; never executes trades.", risk: "compute", allowedAgents: ["crypto_screening_analyst", "equity_screening_analyst", "market_data_steward", "screening_synthesizer", "quant_researcher", "risk_manager"], maxCallsPerMinute: 20, failureThreshold: 0.45, minimumSamples: 5, cooldownMs: 2e4 },
  advanced_strategy_backtest: { name: "advanced_strategy_backtest", description: "Run cost-aware historical strategy simulations; never places orders.", risk: "compute", allowedAgents: ["crypto_screening_analyst", "equity_screening_analyst", "quant_researcher", "risk_manager"], maxCallsPerMinute: 10, failureThreshold: 0.4, minimumSamples: 5, cooldownMs: 3e4 },
  market_stream_subscription: { name: "market_stream_subscription", description: "Build bounded provider subscription payloads without exposing credentials.", risk: "external", allowedAgents: ["market_data_steward", "crypto_screening_analyst", "equity_screening_analyst", "market_microstructure"], maxCallsPerMinute: 30, failureThreshold: 0.5, minimumSamples: 5, cooldownMs: 2e4 }
};
var runtime = /* @__PURE__ */ new Map();
var callWindow = /* @__PURE__ */ new Map();
function stateFor(toolName) {
  const current = runtime.get(toolName) ?? { successes: 0, failures: 0 };
  runtime.set(toolName, current);
  return current;
}
function canInvokeTool(toolName, agentRole) {
  const policy = TOOL_POLICIES[toolName];
  if (!policy) return { allowed: false, reason: "Tool is not registered." };
  if (policy.allowedAgents !== "all" && !policy.allowedAgents.includes(agentRole)) return { allowed: false, reason: `Agent '${agentRole}' is not permitted to call '${toolName}'.` };
  const state = stateFor(toolName);
  if (state.openedAt) {
    const elapsed = Date.now() - state.openedAt;
    if (elapsed < policy.cooldownMs) return { allowed: false, reason: `Circuit is open for '${toolName}' until cooldown elapses.` };
    return { allowed: true, state: "half_open", reason: "Cooldown elapsed; probe call allowed." };
  }
  const window = callWindow.get(toolName);
  if (window && Date.now() - window.startedAt < 6e4 && window.count >= policy.maxCallsPerMinute) return { allowed: false, reason: `Rate limit reached for '${toolName}'.` };
  return { allowed: true, state: "closed", reason: "Permission and circuit checks passed." };
}
function recordToolSuccess(toolName) {
  const state = stateFor(toolName);
  state.successes += 1;
  state.lastUsedAt = Date.now();
  state.openedAt = void 0;
  state.lastError = void 0;
  const window = callWindow.get(toolName);
  if (!window || Date.now() - window.startedAt >= 6e4) callWindow.set(toolName, { startedAt: Date.now(), count: 1 });
  else window.count += 1;
}
function recordToolFailure(toolName, error) {
  const policy = TOOL_POLICIES[toolName];
  if (!policy) return;
  const state = stateFor(toolName);
  state.failures += 1;
  state.lastUsedAt = Date.now();
  state.lastError = error.slice(0, 500);
  const total = state.successes + state.failures;
  if (total >= policy.minimumSamples && state.failures / total >= policy.failureThreshold) state.openedAt = Date.now();
}
function listToolPolicies() {
  return Object.values(TOOL_POLICIES).map((policy) => ({ ...policy }));
}
function listToolRuntime() {
  return Object.values(TOOL_POLICIES).map((policy) => {
    const state = stateFor(policy.name);
    const decision = canInvokeTool(policy.name, policy.allowedAgents === "all" ? "brainstormer" : policy.allowedAgents[0]);
    return { toolName: policy.name, state: state.openedAt ? Date.now() - state.openedAt >= policy.cooldownMs ? "half_open" : "open" : "closed", successes: state.successes, failures: state.failures, lastError: state.lastError ?? null, lastUsedAt: state.lastUsedAt ?? null, allowedNow: decision.allowed };
  });
}
function resetToolCircuit(toolName) {
  if (!TOOL_POLICIES[toolName]) throw new Error(`Unknown tool: ${toolName}`);
  runtime.set(toolName, { successes: 0, failures: 0 });
  callWindow.delete(toolName);
  return { toolName, reset: true };
}

// server/_core/tradingStrategy.ts
function sma4(data, period) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    result.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return result;
}
function ema3(data, period) {
  const result = [];
  const k = 2 / (period + 1);
  let prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < data.length; i++) {
    prev = data[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}
function rsi2(data, period = 14) {
  const result = [];
  const gains = [];
  const losses = [];
  for (let i = 1; i < data.length; i++) gains.push(data[i] > data[i - 1] ? data[i] - data[i - 1] : 0);
  for (let i = 1; i < data.length; i++) losses.push(data[i] < data[i - 1] ? data[i - 1] - data[i] : 0);
  if (gains.length < period) return result;
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i <= gains.length; i++) {
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}
function trueRange2(data) {
  const result = [];
  for (let i = 1; i < data.length; i++) {
    result.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)));
  }
  return result;
}
function atr2(data, period = 14) {
  const tr = trueRange2(data);
  const result = [];
  if (tr.length < period) return result;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    result.push(prev);
  }
  return result;
}
function bollingerBands2(data, period = 20, stdMult = 2) {
  const middle = sma4(data, period);
  const upper = [];
  const lower = [];
  const pctB = [];
  const bandwidth = [];
  for (let i = 0; i < middle.length; i++) {
    const slice = data.slice(i, i + period);
    const mean4 = middle[i];
    const variance = slice.reduce((s, v) => s + (v - mean4) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const u = mean4 + stdMult * sd;
    const l = mean4 - stdMult * sd;
    upper.push(u);
    lower.push(l);
    pctB.push(sd === 0 ? 0.5 : (data[i + period - 1] - l) / (u - l));
    bandwidth.push(mean4 === 0 ? 0 : (u - l) / mean4 * 100);
  }
  return { upper, middle, lower, pctB, bandwidth };
}
function macd2(data, fast = 12, slow = 26, signal = 9) {
  const fastEma = ema3(data, fast);
  const slowEma = ema3(data, slow);
  const offset = slow - fast;
  const macdLine = [];
  for (let i = 0; i < slowEma.length; i++) macdLine.push(fastEma[i + offset] - slowEma[i]);
  const signalLine = ema3(macdLine, signal);
  const histOffset = signal - 1;
  const histogram = [];
  for (let i = 0; i < signalLine.length; i++) histogram.push(macdLine[i + histOffset] - signalLine[i]);
  return { macdLine, signalLine, histogram };
}
function stochastic2(data, kPeriod = 14, dPeriod = 3) {
  const kValues = [];
  for (let i = kPeriod - 1; i < data.length; i++) {
    const highs = data.slice(i - kPeriod + 1, i + 1).map((d) => d.high);
    const lows = data.slice(i - kPeriod + 1, i + 1).map((d) => d.low);
    const hh = Math.max(...highs);
    const ll = Math.min(...lows);
    kValues.push(hh === ll ? 50 : (data[i].close - ll) / (hh - ll) * 100);
  }
  const dValues = sma4(kValues, dPeriod);
  return { k: kValues, d: dValues };
}
function adx2(data, period = 14) {
  const tr = trueRange2(data);
  if (tr.length < period) return { adx: [], plusDI: [], minusDI: [] };
  const plusDM = [];
  const minusDM = [];
  for (let i = 1; i < data.length; i++) {
    const upMove = data[i].high - data[i - 1].high;
    const downMove = data[i - 1].low - data[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smoothTR = [];
  const smoothPDM = [];
  const smoothMDM = [];
  let sTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sPDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sMDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  smoothTR.push(sTR);
  smoothPDM.push(sPDM);
  smoothMDM.push(sMDM);
  for (let i = period; i < tr.length; i++) {
    sTR = sTR - sTR / period + tr[i];
    sPDM = sPDM - sPDM / period + plusDM[i];
    sMDM = sMDM - sMDM / period + minusDM[i];
    smoothTR.push(sTR);
    smoothPDM.push(sPDM);
    smoothMDM.push(sMDM);
  }
  const plusDI = smoothPDM.map((v, i) => smoothTR[i] === 0 ? 0 : v / smoothTR[i] * 100);
  const minusDI = smoothMDM.map((v, i) => smoothTR[i] === 0 ? 0 : v / smoothTR[i] * 100);
  const dx = plusDI.map((v, i) => {
    const sum = v + minusDI[i];
    return sum === 0 ? 0 : Math.abs(v - minusDI[i]) / sum * 100;
  });
  const adxValues = ema3(dx, period);
  return { adx: adxValues, plusDI, minusDI };
}
function williamsR2(data, period = 14) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const highs = data.slice(i - period + 1, i + 1).map((d) => d.high);
    const lows = data.slice(i - period + 1, i + 1).map((d) => d.low);
    const hh = Math.max(...highs);
    const ll = Math.min(...lows);
    result.push(hh === ll ? -50 : (hh - data[i].close) / (hh - ll) * -100);
  }
  return result;
}
function cci2(data, period = 20) {
  const tp = data.map((d) => (d.high + d.low + d.close) / 3);
  const tpSma = sma4(tp, period);
  const result = [];
  for (let i = 0; i < tpSma.length; i++) {
    const slice = tp.slice(i, i + period);
    const mean4 = tpSma[i];
    const meanDev = slice.reduce((s, v) => s + Math.abs(v - mean4), 0) / period;
    result.push(meanDev === 0 ? 0 : (tp[i + period - 1] - mean4) / (0.015 * meanDev));
  }
  return result;
}
function obv2(data) {
  const result = [0];
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) result.push(result[i - 1] + data[i].volume);
    else if (data[i].close < data[i - 1].close) result.push(result[i - 1] - data[i].volume);
    else result.push(result[i - 1]);
  }
  return result;
}
function vwap(data) {
  const result = [];
  let cumTPV = 0;
  let cumV = 0;
  for (const bar of data) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumTPV += tp * bar.volume;
    cumV += bar.volume;
    result.push(cumV === 0 ? bar.close : cumTPV / cumV);
  }
  return result;
}
function generateRSIBBSignal(candles, params) {
  const rsiPeriod = params?.rsiPeriod ?? 14;
  const rsiOversold = params?.rsiOversold ?? 35;
  const rsiOverbought = params?.rsiOverbought ?? 65;
  const bbPeriod = params?.bbPeriod ?? 20;
  const bbStdDev = params?.bbStdDev ?? 2;
  const closes2 = candles.map((c) => c.close);
  const rsiVals = rsi2(closes2, rsiPeriod);
  const bb = bollingerBands2(closes2, bbPeriod, bbStdDev);
  const signals = [];
  const offset = Math.max(rsiPeriod, bbPeriod) - 1;
  for (let i = 0; i < candles.length; i++) {
    const rsiIdx = i - offset;
    const bbIdx = i - bbPeriod + 1;
    if (rsiIdx < 0 || bbIdx < 0 || bbIdx >= bb.lower.length) {
      signals.push("NEUTRAL");
      continue;
    }
    const price = candles[i].close;
    const rsiVal = rsiVals[rsiIdx];
    const lowerBand = bb.lower[bbIdx];
    const upperBand = bb.upper[bbIdx];
    if (price <= lowerBand && rsiVal < rsiOversold) signals.push("LONG");
    else if (price >= upperBand && rsiVal > rsiOverbought) signals.push("SHORT");
    else signals.push("NEUTRAL");
  }
  return signals;
}
function generateMACDCrossSignal(candles, params) {
  const { histogram } = macd2(candles.map((c) => c.close), params?.fast ?? 12, params?.slow ?? 26, params?.signal ?? 9);
  const signals = [];
  const offset = 26 - 1 + 9 - 1;
  for (let i = 0; i < candles.length; i++) {
    const histIdx = i - offset;
    if (histIdx < 1 || histIdx >= histogram.length) {
      signals.push("NEUTRAL");
      continue;
    }
    if (histogram[histIdx - 1] <= 0 && histogram[histIdx] > 0) signals.push("LONG");
    else if (histogram[histIdx - 1] >= 0 && histogram[histIdx] < 0) signals.push("SHORT");
    else signals.push("NEUTRAL");
  }
  return signals;
}
function generateStochasticCrossSignal(candles, params) {
  const kP = params?.kPeriod ?? 14;
  const dP = params?.dPeriod ?? 3;
  const ob = params?.overbought ?? 80;
  const os = params?.oversold ?? 20;
  const { k, d } = stochastic2(candles, kP, dP);
  const signals = [];
  const offset = kP - 1 + dP - 1;
  for (let i = 0; i < candles.length; i++) {
    const dIdx = i - offset;
    if (dIdx < 1 || dIdx >= d.length) {
      signals.push("NEUTRAL");
      continue;
    }
    const kIdx = dIdx + dP - 1;
    if (k[kIdx] > d[dIdx] && k[kIdx] < ob && k[kIdx - 1] <= d[dIdx - 1]) signals.push("LONG");
    else if (k[kIdx] < d[dIdx] && k[kIdx] > os && k[kIdx - 1] >= d[dIdx - 1]) signals.push("SHORT");
    else signals.push("NEUTRAL");
  }
  return signals;
}
function generateIchimokuSuperTrendSignal(candles, params) {
  return candles.map((_, i) => {
    const slice = candles.slice(0, i + 1);
    if (slice.length < Math.max(params?.spanPeriod ?? 52, params?.superTrendPeriod ?? 10)) return "NEUTRAL";
    const cloud = ichimokuCloudIndicator(slice, params?.conversionPeriod ?? 9, params?.basePeriod ?? 26, params?.spanPeriod ?? 52, params?.displacement ?? 26);
    const trend = superTrendIndicator(slice, params?.superTrendPeriod ?? 10, params?.multiplier ?? 3);
    return cloud.bias === "above-cloud" && trend.direction === "up" ? "LONG" : cloud.bias === "below-cloud" && trend.direction === "down" ? "SHORT" : "NEUTRAL";
  });
}
function generateFibonacciBreakoutSignal(candles, params) {
  const lookback = params?.lookback ?? 100;
  const threshold = (params?.thresholdBps ?? 5) / 1e4;
  return candles.map((_, i) => {
    const slice = candles.slice(0, i + 1);
    if (slice.length < Math.min(lookback, 20)) return "NEUTRAL";
    const fib = fibonacciRetracementIndicator(slice, lookback);
    const close = slice.at(-1)?.close ?? 0;
    const levels = Object.values(fib.levels).map(Number);
    const upper = Math.max(...levels);
    const lower = Math.min(...levels);
    return close > upper * (1 + threshold) ? "LONG" : close < lower * (1 - threshold) ? "SHORT" : "NEUTRAL";
  });
}
function generateConfluenceSignal(candles) {
  return candles.map((_, i) => {
    const slice = candles.slice(0, i + 1);
    if (slice.length < 30) return "NEUTRAL";
    const cloud = ichimokuCloudIndicator(slice);
    const trend = superTrendIndicator(slice);
    const emaSignal = generateEMACrossSignal(slice).at(-1);
    const votes = [cloud.bias === "above-cloud" ? 1 : cloud.bias === "below-cloud" ? -1 : 0, trend.direction === "up" ? 1 : -1, emaSignal === "LONG" ? 1 : emaSignal === "SHORT" ? -1 : 0];
    return votes.reduce((sum, vote) => sum + vote, 0) >= 2 ? "LONG" : votes.reduce((sum, vote) => sum + vote, 0) <= -2 ? "SHORT" : "NEUTRAL";
  });
}
function generateEMACrossSignal(candles, params) {
  const fast = params?.fast ?? 12;
  const slow = params?.slow ?? 26;
  const fastEma = ema3(candles.map((c) => c.close), fast);
  const slowEma = ema3(candles.map((c) => c.close), slow);
  const signals = [];
  const offset = slow - 1;
  const fastOffset = slow - fast;
  for (let i = 0; i < candles.length; i++) {
    const sIdx = i - offset;
    if (sIdx < 1 || sIdx >= slowEma.length) {
      signals.push("NEUTRAL");
      continue;
    }
    const fIdx = sIdx + fastOffset;
    if (fastEma[fIdx] > slowEma[sIdx] && fastEma[fIdx - 1] <= slowEma[sIdx - 1]) signals.push("LONG");
    else if (fastEma[fIdx] < slowEma[sIdx] && fastEma[fIdx - 1] >= slowEma[sIdx - 1]) signals.push("SHORT");
    else signals.push("NEUTRAL");
  }
  return signals;
}
function runBacktest(candles, strategy) {
  const signals = generateSignals(candles, strategy.entryRules);
  const atrVals = atr2(candles, 14);
  const atrOffset = 14;
  const trades = [];
  let tradeId = 0;
  let activeTrade = null;
  let lastExitBar = -999;
  const equity = 1e4;
  const equityCurve = [equity];
  let peak = equity;
  const drawdownCurve = [0];
  let maxDD = 0;
  const isJpy = strategy.name.toLowerCase().includes("jpy");
  const pipSize = isJpy ? 0.01 : 1e-4;
  for (let i = 0; i < candles.length; i++) {
    const currentAtr = i - atrOffset >= 0 && i - atrOffset < atrVals.length ? atrVals[i - atrOffset] : candles[i].high - candles[i].low;
    if (activeTrade) {
      const trade = activeTrade;
      trade.holdingBars++;
      let exitPrice = null;
      let exitReason = null;
      if (trade.direction === "LONG") {
        if (candles[i].high >= trade.tpPrice) {
          exitPrice = trade.tpPrice;
          exitReason = "TAKE_PROFIT";
        } else if (candles[i].low <= trade.slPrice) {
          exitPrice = trade.slPrice;
          exitReason = "STOP_LOSS";
        }
      } else {
        if (candles[i].low <= trade.tpPrice) {
          exitPrice = trade.tpPrice;
          exitReason = "TAKE_PROFIT";
        } else if (candles[i].high >= trade.slPrice) {
          exitPrice = trade.slPrice;
          exitReason = "STOP_LOSS";
        }
      }
      if (trade.holdingBars >= strategy.exitRules.maxHoldingBars && !exitPrice) {
        exitPrice = candles[i].close;
        exitReason = "TIME_EXIT";
      }
      if (!exitPrice && signals[i] !== "NEUTRAL") {
        if (trade.direction === "LONG" && signals[i] === "SHORT") {
          exitPrice = candles[i].close;
          exitReason = "SIGNAL_REVERSAL";
        } else if (trade.direction === "SHORT" && signals[i] === "LONG") {
          exitPrice = candles[i].close;
          exitReason = "SIGNAL_REVERSAL";
        }
      }
      if (exitPrice && exitReason) {
        trade.exitPrice = exitPrice;
        trade.exitTime = candles[i].timestamp;
        trade.exitReason = exitReason;
        const pipDiff = trade.direction === "LONG" ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
        trade.pnlPips = Math.round(pipDiff / pipSize * 100) / 100;
        trade.pnl = pipDiff * trade.quantity;
        trades.push(trade);
        activeTrade = null;
        lastExitBar = i;
      }
    }
    if (!activeTrade && signals[i] !== "NEUTRAL" && i - lastExitBar >= (strategy.riskManagement.minBarsBetweenTrades ?? 5)) {
      const tpAtrMult = strategy.exitRules.tpAtrMult;
      const slAtrMult = strategy.exitRules.slAtrMult;
      const direction = signals[i];
      const entryPrice = candles[i].close;
      const tpPrice = direction === "LONG" ? entryPrice + tpAtrMult * currentAtr : entryPrice - tpAtrMult * currentAtr;
      const slPrice = direction === "LONG" ? entryPrice - slAtrMult * currentAtr : entryPrice + slAtrMult * currentAtr;
      tradeId++;
      activeTrade = {
        id: tradeId,
        entryTime: candles[i].timestamp,
        exitTime: null,
        direction,
        entryPrice,
        exitPrice: null,
        quantity: 1,
        pnl: null,
        pnlPips: null,
        exitReason: null,
        holdingBars: 0,
        tpPrice,
        slPrice
      };
    }
    const currentEquity = equity + trades.reduce((sum, t2) => sum + (t2.pnl ?? 0), 0);
    equityCurve.push(currentEquity);
    if (currentEquity > peak) peak = currentEquity;
    const dd = peak > 0 ? (peak - currentEquity) / peak * 100 : 0;
    drawdownCurve.push(-dd);
    if (dd > maxDD) maxDD = dd;
  }
  return computeStats(trades, equityCurve, drawdownCurve);
}
function generateSignals(candles, rules) {
  for (const rule of rules) {
    switch (rule.type) {
      case "rsi_bb_reversal":
        return generateRSIBBSignal(candles, rule.params);
      case "macd_cross":
        return generateMACDCrossSignal(candles, rule.params);
      case "stochastic_cross":
        return generateStochasticCrossSignal(candles, rule.params);
      case "ema_cross":
        return generateEMACrossSignal(candles, rule.params);
      case "ichimoku_supertrend":
        return generateIchimokuSuperTrendSignal(candles, rule.params);
      case "fibonacci_breakout":
        return generateFibonacciBreakoutSignal(candles, rule.params);
      case "multi_indicator_confluence":
        return generateConfluenceSignal(candles);
    }
  }
  return candles.map(() => "NEUTRAL");
}
function computeStats(trades, equityCurve, drawdownCurve) {
  const wins = trades.filter((t2) => (t2.pnl ?? 0) > 0);
  const losses = trades.filter((t2) => (t2.pnl ?? 0) < 0);
  const totalWin = wins.reduce((s, t2) => s + (t2.pnl ?? 0), 0);
  const totalLoss = Math.abs(losses.reduce((s, t2) => s + (t2.pnl ?? 0), 0));
  const longs = trades.filter((t2) => t2.direction === "LONG");
  const shorts = trades.filter((t2) => t2.direction === "SHORT");
  const longWins = longs.filter((t2) => (t2.pnl ?? 0) > 0);
  const shortWins = shorts.filter((t2) => (t2.pnl ?? 0) > 0);
  const returns = equityCurve.slice(1).map((v, i) => i === 0 ? 0 : (v - equityCurve[i]) / equityCurve[i]);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length || 1));
  const negReturns = returns.filter((r) => r < 0);
  const downDev = Math.sqrt(negReturns.reduce((s, r) => s + r ** 2, 0) / (negReturns.length || 1));
  let maxConsWins = 0, maxConsLosses = 0, consWins = 0, consLosses = 0;
  for (const t2 of trades) {
    if ((t2.pnl ?? 0) > 0) {
      consWins++;
      consLosses = 0;
      maxConsWins = Math.max(maxConsWins, consWins);
    } else if ((t2.pnl ?? 0) < 0) {
      consLosses++;
      consWins = 0;
      maxConsLosses = Math.max(maxConsLosses, consLosses);
    } else {
      consWins = 0;
      consLosses = 0;
    }
  }
  return {
    trades,
    totalTrades: trades.length,
    winRate: trades.length > 0 ? wins.length / trades.length * 100 : 0,
    totalPnl: Math.round(trades.reduce((s, t2) => s + (t2.pnl ?? 0), 0) * 100) / 100,
    totalPnlPips: Math.round(trades.reduce((s, t2) => s + (t2.pnlPips ?? 0), 0) * 100) / 100,
    avgWin: wins.length > 0 ? totalWin / wins.length : 0,
    avgLoss: losses.length > 0 ? -totalLoss / losses.length : 0,
    profitFactor: totalLoss === 0 ? 0 : totalWin / totalLoss,
    maxDrawdown: Math.round(Math.max(...drawdownCurve.map(Math.abs)) * 100) / 100,
    maxDrawdownPct: Math.round(Math.max(...drawdownCurve.map(Math.abs)) * 100) / 100,
    sharpeRatio: stdReturn === 0 ? 0 : Math.round(avgReturn / stdReturn * 100) / 100,
    sortinoRatio: downDev === 0 ? 0 : Math.round(avgReturn / downDev * 100) / 100,
    avgHoldingBars: trades.length > 0 ? Math.round(trades.reduce((s, t2) => s + t2.holdingBars, 0) / trades.length * 10) / 10 : 0,
    longTrades: longs.length,
    shortTrades: shorts.length,
    longWinRate: longs.length > 0 ? longWins.length / longs.length * 100 : 0,
    shortWinRate: shorts.length > 0 ? shortWins.length / shorts.length * 100 : 0,
    tpHits: trades.filter((t2) => t2.exitReason === "TAKE_PROFIT").length,
    slHits: trades.filter((t2) => t2.exitReason === "STOP_LOSS").length,
    timeExits: trades.filter((t2) => t2.exitReason === "TIME_EXIT").length,
    consecutiveWins: maxConsWins,
    consecutiveLosses: maxConsLosses,
    expectancy: trades.length > 0 ? trades.reduce((s, t2) => s + (t2.pnl ?? 0), 0) / trades.length : 0,
    equityCurve,
    drawdownCurve
  };
}
var BUILT_IN_STRATEGIES = [
  {
    name: "RSI + BB Reversal",
    description: "Mean reversion combining RSI overbought/oversold with Bollinger Band extremes. Best for ranging markets on V75.",
    timeframe: "1M",
    marketType: "ranging",
    entryRules: [{ type: "rsi_bb_reversal", params: { rsiPeriod: 14, rsiOversold: 35, rsiOverbought: 65, bbPeriod: 20, bbStdDev: 2 } }],
    exitRules: { tpAtrMult: 1.5, slAtrMult: 1.2, maxHoldingBars: 30 },
    riskManagement: { riskPerTrade: 2, maxConcurrentPositions: 3, minBarsBetweenTrades: 5 }
  },
  {
    name: "MACD Crossover",
    description: "Classic MACD histogram zero-line crossover strategy. Good for trending markets.",
    timeframe: "5M",
    marketType: "trending",
    entryRules: [{ type: "macd_cross", params: { fast: 12, slow: 26, signal: 9 } }],
    exitRules: { tpAtrMult: 2, slAtrMult: 1, trailingStop: true, trailingAtrMult: 1, maxHoldingBars: 60 },
    riskManagement: { riskPerTrade: 2, maxConcurrentPositions: 2, minBarsBetweenTrades: 10 }
  },
  {
    name: "Stochastic Cross",
    description: "Stochastic %K/%D crossover in overbought/oversold zones. Ranging market scalping.",
    timeframe: "1M",
    marketType: "ranging",
    entryRules: [{ type: "stochastic_cross", params: { kPeriod: 14, dPeriod: 3, overbought: 80, oversold: 20 } }],
    exitRules: { tpAtrMult: 1.5, slAtrMult: 1, maxHoldingBars: 20 },
    riskManagement: { riskPerTrade: 1.5, maxConcurrentPositions: 3, minBarsBetweenTrades: 3 }
  },
  {
    name: "EMA Cross Trend",
    description: "Fast/slow EMA crossover for trend following. Works well on higher timeframes.",
    timeframe: "15M",
    marketType: "trending",
    entryRules: [{ type: "ema_cross", params: { fast: 12, slow: 26 } }],
    exitRules: { tpAtrMult: 3, slAtrMult: 1.5, trailingStop: true, trailingAtrMult: 1.5, maxHoldingBars: 100 },
    riskManagement: { riskPerTrade: 2, maxConcurrentPositions: 2, minBarsBetweenTrades: 15 }
  },
  {
    name: "Ichimoku + SuperTrend Regime",
    description: "Trend-regime strategy requiring price above/below the Ichimoku cloud and matching SuperTrend direction.",
    timeframe: "1H",
    marketType: "trending",
    entryRules: [{ type: "ichimoku_supertrend", params: { conversionPeriod: 9, basePeriod: 26, spanPeriod: 52, superTrendPeriod: 10, multiplier: 3 } }],
    exitRules: { tpAtrMult: 3, slAtrMult: 1.5, trailingStop: true, trailingAtrMult: 1.5, maxHoldingBars: 120 },
    riskManagement: { riskPerTrade: 1, maxConcurrentPositions: 1, minBarsBetweenTrades: 20 }
  },
  {
    name: "Fibonacci Range Breakout",
    description: "Breakout screen using recent Fibonacci range extremes with ATR-based exits and bounded lookback.",
    timeframe: "15M",
    marketType: "breakout",
    entryRules: [{ type: "fibonacci_breakout", params: { lookback: 100, thresholdBps: 5 } }],
    exitRules: { tpAtrMult: 2.5, slAtrMult: 1.25, trailingStop: true, trailingAtrMult: 1.25, maxHoldingBars: 80 },
    riskManagement: { riskPerTrade: 1, maxConcurrentPositions: 1, minBarsBetweenTrades: 25 }
  },
  {
    name: "Multi-Indicator Confluence",
    description: "Requires agreement from Ichimoku location, SuperTrend direction, and EMA crossover before entering.",
    timeframe: "4H",
    marketType: "trending",
    entryRules: [{ type: "multi_indicator_confluence", params: {} }],
    exitRules: { tpAtrMult: 3.5, slAtrMult: 1.75, trailingStop: true, trailingAtrMult: 1.5, maxHoldingBars: 160 },
    riskManagement: { riskPerTrade: 0.75, maxConcurrentPositions: 1, minBarsBetweenTrades: 30 }
  }
];
function detectCandlePatterns(candles) {
  return candles.map((c, i) => {
    const patterns = [];
    if (i < 1) return patterns;
    const prev = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const isBullish = c.close > c.open;
    const prevBody = Math.abs(prev.close - prev.open);
    const prevRange = prev.high - prev.low;
    const prevIsBullish = prev.close > prev.open;
    if (body < range * 0.1 && range > 0) patterns.push({ name: "Doji", type: "neutral", reliability: "medium", description: "Indecision candle - potential reversal" });
    if (lowerWick > body * 2 && upperWick < body * 0.5 && !isBullish && lowerWick > range * 0.6) patterns.push({ name: "Hammer", type: "bullish", reliability: "high", description: "Bullish reversal after downtrend" });
    if (upperWick > body * 2 && lowerWick < body * 0.5 && isBullish && upperWick > range * 0.6) patterns.push({ name: "Shooting Star", type: "bearish", reliability: "high", description: "Bearish reversal after uptrend" });
    if (isBullish && !prevIsBullish && c.open <= prev.close && c.close >= prev.open && body > prevBody) patterns.push({ name: "Bullish Engulfing", type: "bullish", reliability: "high", description: "Strong bullish reversal pattern" });
    if (!isBullish && prevIsBullish && c.open >= prev.close && c.close <= prev.open && body > prevBody) patterns.push({ name: "Bearish Engulfing", type: "bearish", reliability: "high", description: "Strong bearish reversal pattern" });
    if (i >= 2) {
      const twoBefore = candles[i - 2];
      const twoBeforeBody = Math.abs(twoBefore.close - twoBefore.open);
      if (!prevIsBullish && prevBody < twoBeforeBody * 0.3 && isBullish && body > twoBeforeBody * 0.5 && c.close > (twoBefore.open + twoBefore.close) / 2) patterns.push({ name: "Morning Star", type: "bullish", reliability: "high", description: "Three-candle bullish reversal" });
      if (prevIsBullish && prevBody < twoBeforeBody * 0.3 && !isBullish && body > twoBeforeBody * 0.5 && c.close < (twoBefore.open + twoBefore.close) / 2) patterns.push({ name: "Evening Star", type: "bearish", reliability: "high", description: "Three-candle bearish reversal" });
    }
    if (!isBullish && prevIsBullish && c.open < prev.low && c.close > (prev.open + prev.close) / 2 && c.close < prev.open) patterns.push({ name: "Piercing Line", type: "bullish", reliability: "medium", description: "Bullish reversal - price pierces midpoint" });
    if (isBullish && !prevIsBullish && c.open > prev.high && c.close < (prev.open + prev.close) / 2 && c.close > prev.open) patterns.push({ name: "Dark Cloud Cover", type: "bearish", reliability: "medium", description: "Bearish reversal - dark cloud pattern" });
    if (body < range * 0.25 && upperWick > body * 0.5 && lowerWick > body * 0.5) patterns.push({ name: "Spinning Top", type: "neutral", reliability: "low", description: "Indecision with significant wicks" });
    if (upperWick < range * 0.05 && lowerWick < range * 0.05 && body > range * 0.8) {
      patterns.push({ name: isBullish ? "Bullish Marubozu" : "Bearish Marubozu", type: isBullish ? "bullish" : "bearish", reliability: "medium", description: `Strong ${isBullish ? "buying" : "selling"} pressure` });
    }
    return patterns;
  });
}
function buildDerivWebSocketURL(appId = "1089") {
  return `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
}
var DERIV_SYMBOLS = [
  { symbol: "R_10", name: "Volatility 10 Index", pipSize: 1e-3 },
  { symbol: "R_25", name: "Volatility 25 Index", pipSize: 1e-3 },
  { symbol: "R_50", name: "Volatility 50 Index", pipSize: 1e-3 },
  { symbol: "R_75", name: "Volatility 75 Index", pipSize: 1e-3 },
  { symbol: "R_100", name: "Volatility 100 Index", pipSize: 1e-3 },
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index", pipSize: 1e-5 },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index", pipSize: 1e-5 },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index", pipSize: 1e-5 },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index", pipSize: 1e-5 },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index", pipSize: 1e-5 }
];

// server/_core/researchEngine.ts
var defaults = { fastPeriod: 20, slowPeriod: 50, rsiPeriod: 14, longRsi: 55, shortRsi: 45, initialCapital: 1e5, riskPerTrade: 0.01, feeBps: 1, slippageBps: 2, maxHoldingBars: 40 };
var resolveConfig = (config = {}) => ({ ...defaults, ...config });
var mean2 = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
var std = (values) => {
  const average = mean2(values);
  return Math.sqrt(mean2(values.map((value) => (value - average) ** 2)));
};
function signalAt(index2, data, config) {
  const closes2 = data.map((bar) => bar.close), fast = ema(closes2, config.fastPeriod), slow = ema(closes2, config.slowPeriod), momentum = rsi(closes2, config.rsiPeriod);
  const fastValue = fast[index2] ?? closes2[index2], slowValue = slow[index2] ?? closes2[index2], rsiValue2 = momentum[index2] ?? 50;
  if (fastValue > slowValue && rsiValue2 >= config.longRsi) return "long";
  if (fastValue < slowValue && rsiValue2 <= config.shortRsi) return "short";
  return "flat";
}
function runBacktest2(data, inputConfig = {}) {
  if (data.length < 60) throw new Error("Backtest requires at least 60 OHLCV candles.");
  const config = resolveConfig(inputConfig), atrValues = atr(data, Math.min(config.rsiPeriod, 20));
  let equity = config.initialCapital, peak = equity, maxDrawdown = 0;
  const trades = [];
  let open = null;
  for (let index2 = Math.max(config.slowPeriod, config.rsiPeriod) + 1; index2 < data.length; index2 += 1) {
    const current = data[index2], signal = signalAt(index2, data, config);
    if (!open && signal !== "flat") {
      const price = current.close * (1 + (signal === "long" ? config.slippageBps : -config.slippageBps) / 1e4);
      const riskAmount = equity * config.riskPerTrade;
      const stopDistance = Math.max(atrValues[index2] ?? price * 5e-3, price * 1e-3);
      open = { index: index2, side: signal, price, quantity: riskAmount / stopDistance };
      continue;
    }
    if (!open) continue;
    const holding = index2 - open.index;
    const reverse = open.side === "long" && signal === "short" || open.side === "short" && signal === "long";
    if (reverse || holding >= config.maxHoldingBars || signal === "flat") {
      const exit = current.close * (1 + (open.side === "long" ? -config.slippageBps : config.slippageBps) / 1e4);
      const grossPnl = (open.side === "long" ? exit - open.price : open.price - exit) * open.quantity;
      const notional = (open.price + exit) * open.quantity;
      const costs = notional * (config.feeBps / 1e4);
      const netPnl = grossPnl - costs;
      equity += netPnl;
      trades.push({ entryIndex: open.index, exitIndex: index2, side: open.side, entry: open.price, exit, quantity: open.quantity, grossPnl, costs, netPnl, returnPct: open.price ? netPnl / (open.price * open.quantity) * 100 : 0, reason: reverse ? "signal-reversal" : holding >= config.maxHoldingBars ? "time-stop" : "flat-signal" });
      open = null;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak ? (peak - equity) / peak : 0);
    }
  }
  const winners = trades.filter((trade) => trade.netPnl > 0), losers = trades.filter((trade) => trade.netPnl <= 0), returns = trades.map((trade) => trade.returnPct);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPnl, 0), grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));
  return { mode: "backtest", config, initialCapital: config.initialCapital, finalEquity: equity, netPnl: equity - config.initialCapital, returnPct: (equity / config.initialCapital - 1) * 100, tradeCount: trades.length, winRate: trades.length ? winners.length / trades.length : 0, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0, expectancy: mean2(trades.map((trade) => trade.netPnl)), volatility: std(returns), maxDrawdownPct: maxDrawdown * 100, trades, disclaimer: "Historical simulation is not a guarantee of future performance. Results depend on data quality, costs, and execution assumptions." };
}
function runForwardTest(data, inputConfig = {}) {
  const trainPercent = Math.min(90, Math.max(50, inputConfig.trainPercent ?? 70));
  const split = Math.max(60, Math.floor(data.length * trainPercent / 100));
  if (data.length - split < Math.max(60, (inputConfig.slowPeriod ?? defaults.slowPeriod) + 10)) throw new Error("Forward test requires a sufficiently large holdout segment for out-of-sample simulation.");
  const config = resolveConfig(inputConfig);
  const train = runBacktest2(data.slice(0, split), config);
  const holdout = data.slice(Math.max(0, split - config.slowPeriod), data.length).map((bar, index2, values) => ({ ...bar, timestamp: bar.timestamp || index2 + split - config.slowPeriod }));
  const test = runBacktest2(holdout, config);
  return { mode: "forward-test", splitIndex: split, trainPercent, train: { finalEquity: train.finalEquity, returnPct: train.returnPct, tradeCount: train.tradeCount, maxDrawdownPct: train.maxDrawdownPct }, holdout: { finalEquity: test.finalEquity, returnPct: test.returnPct, tradeCount: test.tradeCount, maxDrawdownPct: test.maxDrawdownPct, trades: test.trades }, generalizationGapPct: train.returnPct - test.returnPct, disclaimer: "Forward testing is an out-of-sample research report, not a live execution result or financial recommendation." };
}
function walkForwardAnalysis(data, config = {}) {
  const folds = Math.max(2, Math.min(8, config.folds ?? 4));
  const results = [];
  const foldSize = Math.floor(data.length / (folds + 1));
  for (let fold = 0; fold < folds; fold += 1) {
    const trainEnd = foldSize * (fold + 2), testEnd = Math.min(data.length, trainEnd + foldSize);
    if (testEnd - trainEnd < 10) continue;
    const report = runForwardTest(data.slice(0, testEnd), { ...config, trainPercent: trainEnd / testEnd * 100 });
    results.push({ fold: fold + 1, trainEnd, testEnd, holdoutReturnPct: report.holdout.returnPct, maxDrawdownPct: report.holdout.maxDrawdownPct, tradeCount: report.holdout.tradeCount });
  }
  return { folds: results, averageHoldoutReturnPct: mean2(results.map((result) => result.holdoutReturnPct)), averageDrawdownPct: mean2(results.map((result) => result.maxDrawdownPct)), disclaimer: "Walk-forward results are research diagnostics and require independent validation." };
}

// server/_core/automatedBacktest.ts
function runAutomatedBacktest(candles, strategy, execution = {}) {
  const commissionBps = Math.max(0, execution.commissionBps ?? 0);
  const slippageBps = Math.max(0, execution.slippageBps ?? 0);
  const base = runBacktest(candles, strategy);
  const frictionRate = (commissionBps + slippageBps) / 1e4;
  const adjustedTrades = base.trades.map((trade) => {
    const notional = Math.abs(trade.entryPrice) * Math.max(1, trade.quantity) + Math.abs(trade.exitPrice ?? trade.entryPrice) * Math.max(1, trade.quantity);
    const friction = notional * frictionRate;
    return { ...trade, pnl: (trade.pnl ?? 0) - friction };
  });
  const adjustedPnl = adjustedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const adjusted = { ...base, trades: adjustedTrades, totalPnl: adjustedPnl, expectancy: adjustedTrades.length ? adjustedPnl / adjustedTrades.length : 0, execution: { commissionBps, slippageBps, frictionRate }, disclaimer: "Automated backtests are historical simulations, not live execution or financial advice. Results are sensitive to data quality, costs, slippage, liquidity, and regime changes." };
  const walkForward = execution.walkForwardFolds && execution.walkForwardFolds >= 2 ? walkForwardAnalysis(candles, { folds: Math.min(8, Math.floor(execution.walkForwardFolds)) }) : void 0;
  return { ...adjusted, walkForward };
}

// server/_core/marketStreams.ts
var coinbaseUrl = "wss://advanced-trade-ws.coinbase.com";
function listMarketStreams() {
  return [
    { provider: "coinbase", assets: ["crypto"], url: coinbaseUrl, authRequired: false, channels: ["ticker", "market_trades", "level2", "candles"], configured: true, note: "Public market-data channels; keep keys server-side if authenticated channels are enabled." },
    { provider: "massive", assets: ["stock", "crypto"], url: ENV.massiveWsUrl || null, authRequired: true, channels: ["trades", "quotes", "bars"], configured: Boolean(ENV.massiveWsUrl && ENV.massiveApiKey), note: "Configure MASSIVE_WS_URL and MASSIVE_API_KEY server-side; never expose the key to browsers." }
  ];
}
function buildCoinbaseSubscription(productIds, channel = "ticker") {
  const products = productIds.map(String).filter(Boolean).slice(0, 50);
  if (!products.length) throw new Error("At least one product is required");
  return { type: "subscribe", channel, product_ids: products };
}
function buildMassiveSubscription(symbols, channel = "trades") {
  const safe = symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean).slice(0, 100);
  if (!safe.length) throw new Error("At least one symbol is required");
  return { action: "subscribe", params: `${channel}:${safe.join(",")}` };
}

// server/_core/agents.ts
var webSearchTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information, news, and data",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"]
    }
  }
};
var calculatorTool = {
  type: "function",
  function: {
    name: "calculator",
    description: "Evaluate mathematical expressions",
    parameters: {
      type: "object",
      properties: { expression: { type: "string", description: "Math expression to evaluate, e.g., '2 + 2 * 3'" } },
      required: ["expression"]
    }
  }
};
var textAnalysisTool = {
  type: "function",
  function: {
    name: "text_analysis",
    description: "Analyze text for sentiment, readability, statistics, and more",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
        analysisType: { type: "string", enum: ["sentiment", "readability", "statistics", "keywords", "all"], description: "Type of analysis to perform" }
      },
      required: ["text", "analysisType"]
    }
  }
};
var codeExecTool = {
  type: "function",
  function: {
    name: "code_execution",
    description: "Execute JavaScript/TypeScript code snippets and return the result",
    parameters: {
      type: "object",
      properties: { code: { type: "string", description: "Code to execute" }, language: { type: "string", enum: ["javascript", "typescript"], description: "Language of the code" } },
      required: ["code"]
    }
  }
};
var marketScreeningTool = { type: "function", function: { name: "market_screening_snapshot", description: "Screen supplied fresh crypto or stock OHLCV assets with deterministic indicators; never executes trades.", parameters: { type: "object", properties: { assets: { type: "array" }, indicators: { type: "array" } }, required: ["assets"] } } };
var advancedMusicArrangementTool = { type: "function", function: { name: "advanced_music_arrangement", description: "Generate bounded chord, arpeggio, swing, humanization, velocity, and MIDI-note outputs.", parameters: { type: "object", properties: { operation: { type: "string", enum: ["progression", "arpeggio", "swing", "humanize", "velocity", "note_name"] }, notes: { type: "array" }, events: { type: "array" }, root: { type: "number" }, quality: { type: "string" }, pattern: { type: "string" }, seed: { type: "number" } }, required: ["operation"] } } };
var technicalIndicatorSuiteTool = {
  type: "function",
  function: { name: "technical_indicator_suite", description: "Compute a bounded deterministic suite of technical-analysis indicators from OHLCV candles.", parameters: { type: "object", properties: { data: { type: "array" }, indicators: { type: "array" } }, required: ["data"] } }
};
var advancedStrategyBacktestTool = { type: "function", function: { name: "advanced_strategy_backtest", description: "Run a bounded, cost-aware historical simulation with slippage, commissions, and optional walk-forward diagnostics; never places orders.", parameters: { type: "object", properties: { data: { type: "array" }, strategy: { type: "string" }, commissionBps: { type: "number" }, slippageBps: { type: "number" }, walkForwardFolds: { type: "number" } }, required: ["data"] } } };
var marketStreamSubscriptionTool = { type: "function", function: { name: "market_stream_subscription", description: "Build a safe server-side subscription payload for public Coinbase or configured Massive market data; never exposes credentials or executes trades.", parameters: { type: "object", properties: { provider: { type: "string", enum: ["coinbase", "massive"] }, symbols: { type: "array" }, channel: { type: "string" } }, required: ["provider", "symbols"] } } };
var agenticWorkflowPlanTool = {
  type: "function",
  function: { name: "agentic_workflow_plan", description: "Create a safe role-aware workflow plan with verification and rollback gates.", parameters: { type: "object", properties: { goal: { type: "string" }, constraints: { type: "array" }, riskLevel: { type: "string", enum: ["low", "medium", "high"] } }, required: ["goal"] } }
};
var dataProcessingTool = {
  type: "function",
  function: {
    name: "data_processing",
    description: "Process and transform data (sort, filter, aggregate, compute statistics)",
    parameters: {
      type: "object",
      properties: {
        data: { type: "array", description: "Array of data objects" },
        operation: { type: "string", enum: ["sort", "filter", "aggregate", "stats", "unique", "group"], description: "Operation to perform" },
        field: { type: "string", description: "Field name for the operation" },
        value: { type: "string", description: "Filter value or sort direction (asc/desc)" }
      },
      required: ["data", "operation"]
    }
  }
};
var advancedForexTool = {
  type: "function",
  function: {
    name: "forex_signal_snapshot",
    description: "Analyze OHLCV candles with ADX, CCI, Williams %R, OBV, market structure, volatility regime, and a non-guaranteed directional snapshot.",
    parameters: { type: "object", properties: { data: { type: "array", description: "OHLCV candles" }, period: { type: "number" } }, required: ["data"] }
  }
};
var multiTimeframeTool = {
  type: "function",
  function: {
    name: "forex_multi_timeframe",
    description: "Compare several OHLCV timeframes and calculate confluence.",
    parameters: { type: "object", properties: { frames: { type: "array", description: "Timeframe/data objects" } }, required: ["frames"] }
  }
};
var synthPatchTool = {
  type: "function",
  function: {
    name: "create_synth_patch",
    description: "Create a Serum/Xfer-style engine-neutral synth patch with oscillators, filter, envelopes, LFOs, modulation, effects, and macros.",
    parameters: { type: "object", properties: { name: { type: "string" }, genre: { type: "string" }, mood: { type: "string", enum: ["dark", "bright", "aggressive", "organic", "ambient"] }, tempo: { type: "number" }, wavetable: { type: "string" } }, required: ["name"] }
  }
};
var AGENTS = {
  forex_analyst: {
    id: "forex_analyst",
    name: "Forex Analyst",
    description: "Specialized in forex market analysis, technical indicators, and trading strategies",
    systemPrompt: `You are an expert Forex Analyst AI. You provide detailed technical analysis using multiple indicators including SMA, EMA, RSI, MACD, Bollinger Bands, Stochastic Oscillator, and more.

Your analysis includes:
- Current market sentiment (bullish/bearish/neutral)
- Key support and resistance levels
- Entry and exit signals
- Risk management recommendations
- Fibonacci retracement levels
- Pivot point calculations

Always provide specific price levels, risk/reward ratios, and clear actionable recommendations.
Format your responses with clear headers and use markdown tables when presenting data.
Never provide financial advice as guarantees - always include appropriate disclaimers.`,
    tools: [calculatorTool, webSearchTool, dataProcessingTool, advancedForexTool, multiTimeframeTool],
    maxTokens: 4e3
  },
  code_reviewer: {
    id: "code_reviewer",
    name: "Code Reviewer",
    description: "Reviews code for bugs, security issues, performance problems, and best practices",
    systemPrompt: `You are a senior Code Reviewer AI with 20+ years of experience across multiple languages and frameworks.

When reviewing code, analyze:
1. **Bugs & Logic Errors**: Race conditions, null pointers, off-by-one errors, type mismatches
2. **Security Vulnerabilities**: XSS, SQL injection, CSRF, path traversal, insecure deserialization
3. **Performance**: O(n\xB2) algorithms, unnecessary re-renders, memory leaks, N+1 queries
4. **Code Quality**: DRY violations, naming conventions, function length, cyclomatic complexity
5. **Best Practices**: Error handling, logging, testing, documentation
6. **Architecture**: SOLID principles, separation of concerns, dependency management

Format your review with:
- Summary (2-3 sentences)
- Issues categorized by severity (Critical/Warning/Info)
- Specific line references
- Suggested fixes with code examples
- Overall rating (1-10)
- Key strengths worth noting`,
    tools: [codeExecTool, textAnalysisTool],
    maxTokens: 4e3
  },
  music_composer: {
    id: "music_composer",
    name: "Music Composer",
    description: "Creates music compositions, chord progressions, melodies, and provides music theory analysis",
    systemPrompt: `You are an expert Music Composer AI with deep knowledge of music theory across all genres.

You can help with:
- **Composition**: Create chord progressions, melodies, bass lines, and drum patterns
- **Music Theory**: Explain scales, modes, chord construction, voice leading
- **Arrangement**: Suggest instrument layers, dynamics, song structure
- **Analysis**: Analyze existing progressions, identify key centers, suggest substitutions

When composing, always specify:
- Key and scale/mode
- Chord symbols (e.g., Am7, Cmaj7, G7)
- Rhythm and timing
- Dynamics and articulation
- Instrumentation suggestions

Provide music in both descriptive and notation formats (chord charts, ABC notation when appropriate).
Consider genre conventions and emotional intent.`,
    tools: [calculatorTool, dataProcessingTool, synthPatchTool],
    maxTokens: 4e3
  },
  sound_designer: {
    id: "sound_designer",
    name: "Sound Designer",
    description: "Designs synthesizer patches, modulation systems, and production-ready sound concepts.",
    systemPrompt: "You are a senior sound designer. Use the synth patch tool for structured Serum-style specifications, explain signal flow, and propose safe gain-staging and macro mappings.",
    tools: [calculatorTool, dataProcessingTool, synthPatchTool],
    maxTokens: 4e3
  },
  quant_researcher: {
    id: "quant_researcher",
    name: "Quantitative Researcher",
    description: "Analyzes OHLCV data, regimes, confluence, and backtest assumptions without making guarantees.",
    systemPrompt: "You are a quantitative research specialist. Use advanced forex tools to inspect data, explain assumptions, and distinguish historical analysis from future expectations.",
    tools: [calculatorTool, dataProcessingTool, advancedForexTool, multiTimeframeTool],
    maxTokens: 4500
  },
  risk_manager: {
    id: "risk_manager",
    name: "Risk Manager",
    description: "Reviews analytical scenarios, exposure assumptions, volatility, and risk controls.",
    systemPrompt: "You are a risk manager. Use market-analysis tools to identify uncertainty, drawdown sensitivity, volatility regimes, and risk controls. Never present outputs as guaranteed financial advice.",
    tools: [calculatorTool, dataProcessingTool, advancedForexTool, multiTimeframeTool],
    maxTokens: 4e3
  },
  memory_architect: {
    id: "memory_architect",
    name: "Memory Architect",
    description: "Designs durable memory, retrieval policies, retention, and privacy-aware context systems.",
    systemPrompt: "You are a memory-systems architect. Organize durable context, retention rules, relevance, privacy, and provenance. Never retain secrets unnecessarily.",
    tools: [textAnalysisTool, dataProcessingTool],
    maxTokens: 4e3
  },
  ml_engineer: {
    id: "ml_engineer",
    name: "ML Engineer",
    description: "Designs neural inference, feature engineering, evaluation, and model lifecycle controls.",
    systemPrompt: "You are an ML engineer. Separate inference from training, define features and evaluation protocols, and avoid unsupported predictive guarantees.",
    tools: [calculatorTool, dataProcessingTool, codeExecTool],
    maxTokens: 4500
  },
  music_producer: {
    id: "music_producer",
    name: "Music Producer",
    description: "Builds arrangements, grooves, voicings, automation, and DAW-ready production plans.",
    systemPrompt: "You are a senior music producer. Use structured music tools and synth tools to create playable, mix-aware arrangements and automation.",
    tools: [calculatorTool, dataProcessingTool, synthPatchTool],
    maxTokens: 4500
  },
  audio_engineer: {
    id: "audio_engineer",
    name: "Audio Engineer",
    description: "Designs signal chains, mix diagnostics, spatial systems, and loudness-safe production workflows.",
    systemPrompt: "You are an audio engineer. Design practical signal chains, gain staging, dynamics, spatial placement, and export checks. Keep recommendations measurable and compatible with common DAWs.",
    tools: [calculatorTool, dataProcessingTool, synthPatchTool],
    maxTokens: 4200
  },
  market_microstructure: {
    id: "market_microstructure",
    name: "Market Microstructure Analyst",
    description: "Studies spread, liquidity proxies, volatility clustering, session behavior, and execution assumptions.",
    systemPrompt: "You are a market microstructure analyst. Separate price-pattern observations from execution assumptions, quantify spread and slippage sensitivity, and never promise trading outcomes.",
    tools: [calculatorTool, dataProcessingTool, advancedForexTool, multiTimeframeTool],
    maxTokens: 4200
  },
  data_engineer: {
    id: "data_engineer",
    name: "Data Engineer",
    description: "Designs ingestion, normalization, quality checks, feature stores, and reproducible research datasets.",
    systemPrompt: "You are a data engineer. Focus on schemas, provenance, validation, idempotency, partitioning, and reproducible pipelines.",
    tools: [calculatorTool, dataProcessingTool, codeExecTool],
    maxTokens: 4200
  },
  automation_orchestrator: {
    id: "automation_orchestrator",
    name: "Automation Orchestrator",
    description: "Plans governed multi-step workflows with retries, approvals, observability, and rollback boundaries.",
    systemPrompt: "You are an automation architect. Design explicit stages, permissions, retries, circuit breakers, idempotency keys, and human confirmation gates for high-impact actions.",
    tools: [calculatorTool, dataProcessingTool, textAnalysisTool],
    maxTokens: 4200
  },
  qa_engineer: {
    id: "qa_engineer",
    name: "QA Engineer",
    description: "Builds unit, integration, contract, regression, and production smoke-test plans.",
    systemPrompt: "You are a QA engineer. Turn requirements into deterministic test cases, failure matrices, contract checks, and deployment gates.",
    tools: [calculatorTool, dataProcessingTool, codeExecTool, textAnalysisTool],
    maxTokens: 4200
  },
  data_analyst: {
    id: "data_analyst",
    name: "Data Analyst",
    description: "Analyzes data, creates visualizations descriptions, computes statistics, and finds patterns",
    systemPrompt: `You are an expert Data Analyst AI. You analyze data sets, compute statistics, find patterns, and provide actionable insights.

Your capabilities:
- **Descriptive Statistics**: Mean, median, mode, std dev, percentiles, distribution shape
- **Trend Analysis**: Identify trends, seasonality, and anomalies
- **Correlation**: Find relationships between variables
- **Hypothesis Testing**: Suggest appropriate tests and interpret results
- **Data Quality**: Identify missing values, outliers, inconsistencies

When analyzing data:
1. Start with a summary of the dataset
2. Present key statistics clearly
3. Highlight significant findings
4. Provide visualisation descriptions (what chart type, what to show)
5. Draw actionable conclusions
6. Note limitations and assumptions

Use markdown tables for data presentation. Be precise with numbers.`,
    tools: [calculatorTool, dataProcessingTool, codeExecTool],
    maxTokens: 4e3
  },
  research_agent: {
    id: "research_agent",
    name: "Research Agent",
    description: "Conducts deep research on topics, synthesizes information from multiple angles",
    systemPrompt: `You are a thorough Research Agent AI with expertise across all academic and professional domains.

Research methodology:
1. **Scope Definition**: Clarify the research question and boundaries
2. **Multi-Perspective Analysis**: Examine the topic from different viewpoints
3. **Evidence Gathering**: Present facts, data, and credible sources
4. **Critical Analysis**: Evaluate strengths and weaknesses of different positions
5. **Synthesis**: Integrate findings into coherent conclusions
6. **Gap Identification**: Note what's unknown or contested

Your responses should be:
- Well-structured with clear sections
- Balanced and objective
- Supported by specific evidence
- Honest about uncertainty
- Forward-looking when appropriate

Include citations format where applicable. Distinguish between facts and opinions.`,
    tools: [webSearchTool, textAnalysisTool],
    maxTokens: 6e3
  },
  writing_assistant: {
    id: "writing_assistant",
    name: "Writing Assistant",
    description: "Helps with all forms of writing - articles, emails, reports, creative writing, and more",
    systemPrompt: `You are an expert Writing Assistant AI. You help with all forms of written communication.

You excel at:
- **Professional Writing**: Emails, reports, proposals, memos
- **Creative Writing**: Stories, poems, scripts, dialogue
- **Academic Writing**: Essays, papers, literature reviews
- **Technical Writing**: Documentation, guides, tutorials
- **Copywriting**: Headlines, ad copy, marketing content
- **Editing**: Proofreading, style improvements, clarity enhancements

When helping with writing:
1. Understand the audience and purpose
2. Match the appropriate tone and style
3. Provide structured, polished content
4. Offer alternatives and variations
5. Explain your choices when relevant

Adapt to the user's language and communication style. Be concise yet thorough.`,
    tools: [textAnalysisTool],
    maxTokens: 4e3
  },
  math_tutor: {
    id: "math_tutor",
    name: "Math Tutor",
    description: "Solves mathematical problems step-by-step and explains mathematical concepts",
    systemPrompt: `You are a patient and thorough Math Tutor AI. You make mathematics accessible and understandable.

Your approach:
1. **Problem Solving**: Break down problems into clear, numbered steps
2. **Concept Explanation**: Use analogies, visual descriptions, and real-world examples
3. **Verification**: Show how to check answers
4. **Generalization**: Connect specific problems to broader mathematical concepts
5. **Adaptive Difficulty**: Match the explanation to the apparent level of the student

Cover all areas: algebra, calculus, statistics, linear algebra, discrete math, number theory, geometry, and more.
Use LaTeX-style formatting for mathematical expressions when appropriate.
If the student makes an error, gently point it out and explain why.`,
    tools: [calculatorTool, codeExecTool],
    maxTokens: 4e3
  },
  translator: {
    id: "translator",
    name: "Translator",
    description: "Translates text between languages while preserving meaning, tone, and cultural nuances",
    systemPrompt: `You are an expert Translator AI fluent in all major world languages.

Translation principles:
1. **Accuracy**: Preserve the original meaning faithfully
2. **Fluency**: Produce natural-sounding output in the target language
3. **Cultural Adaptation**: Adjust idioms, references, and cultural elements appropriately
4. **Register**: Maintain the same formality level (formal/informal/technical)
5. **Context**: Consider the broader context of the text

When translating:
- Provide the direct translation first
- Note any cultural adaptations
- Explain idiomatic expressions when they don't have direct equivalents
- Offer alternatives when multiple valid translations exist
- Preserve formatting (headings, lists, etc.)

If the source language isn't specified, detect it automatically.`,
    tools: [textAnalysisTool],
    maxTokens: 4e3
  },
  summarizer: {
    id: "summarizer",
    name: "Summarizer",
    description: "Creates concise summaries of long texts, articles, documents, and conversations",
    systemPrompt: `You are an expert Summarizer AI. You distill complex information into clear, concise summaries.

Summary types you can produce:
- **Executive Summary**: Key points for decision-makers
- **Brief Summary**: 2-3 sentence overview
- **Detailed Summary**: Structured with sections and key points
- **Bullet Summary**: Quick-scan bullet points
- **Comparative Summary**: Side-by-side comparison of multiple sources

Guidelines:
1. Capture the most important information
2. Maintain factual accuracy
3. Preserve key nuances and qualifications
4. Use the same language as the source text
5. Indicate confidence level when uncertain
6. Note omitted details if asked

Adapt length and format to the user's needs.`,
    tools: [textAnalysisTool, dataProcessingTool],
    maxTokens: 4e3
  },
  ui_architect: {
    id: "ui_architect",
    name: "UI Architect",
    description: "Designs responsive, accessible, stateful interfaces and theme systems.",
    systemPrompt: "You are a senior UI architect. Produce implementation-ready interaction contracts, responsive layouts, accessible states, design tokens, and performance-conscious animation plans. Prefer progressive enhancement and reduced-motion fallbacks.",
    tools: [textAnalysisTool, dataProcessingTool, technicalIndicatorSuiteTool, marketScreeningTool, advancedMusicArrangementTool, agenticWorkflowPlanTool],
    maxTokens: 3500
  },
  multimodal_curator: {
    id: "multimodal_curator",
    name: "Multimodal Curator",
    description: "Organizes attachment, transcript, image, and artifact context with provenance and privacy safeguards.",
    systemPrompt: "You are a multimodal information curator. Extract structured context from supplied material, preserve provenance, flag uncertainty, redact secrets, and propose artifact-ready summaries without inventing missing content.",
    tools: [textAnalysisTool, dataProcessingTool, technicalIndicatorSuiteTool, marketScreeningTool, advancedMusicArrangementTool, agenticWorkflowPlanTool],
    maxTokens: 4e3
  },
  observability_engineer: {
    id: "observability_engineer",
    name: "Observability Engineer",
    description: "Analyzes latency, error, health, and circuit-breaker signals and produces cautious remediation plans.",
    systemPrompt: "You are an observability engineer. Separate measured facts from hypotheses, assess latency and error budgets, identify instrumentation gaps, and propose reversible mitigations with rollback criteria.",
    tools: [dataProcessingTool, calculatorTool, agenticWorkflowPlanTool],
    maxTokens: 3500
  },
  security_reviewer: {
    id: "security_reviewer",
    name: "Security Reviewer",
    description: "Reviews authentication, attachments, tools, sandbox boundaries, and privacy controls for exploitable gaps.",
    systemPrompt: "You are a defensive application security reviewer. Inspect supplied designs or code for auth bypasses, secret exposure, injection, unsafe file handling, insecure defaults, and missing rate limits. Recommend fixes and safe tests; do not provide exploit instructions.",
    tools: [textAnalysisTool, codeExecTool, agenticWorkflowPlanTool],
    maxTokens: 4e3
  },
  crypto_screening_analyst: { id: "crypto_screening_analyst", name: "Crypto Screening Analyst", description: "Screens supplied crypto OHLCV data with regime, liquidity, volatility, and technical-factor caveats.", systemPrompt: "You are a crypto market research analyst. Use only supplied or freshly retrieved data, label timestamps and uncertainty, separate descriptive screening from forecasts, and never execute trades.", tools: [technicalIndicatorSuiteTool, marketScreeningTool, advancedStrategyBacktestTool, agenticWorkflowPlanTool], maxTokens: 4e3 },
  equity_screening_analyst: { id: "equity_screening_analyst", name: "Equity Screening Analyst", description: "Screens supplied equity OHLCV data with session, trend, momentum, and data-quality caveats.", systemPrompt: "You are an equity technical-screening analyst. Use only supplied or freshly retrieved data, respect exchange-session context, document assumptions, and never execute trades.", tools: [technicalIndicatorSuiteTool, marketScreeningTool, advancedStrategyBacktestTool, agenticWorkflowPlanTool], maxTokens: 4e3 },
  market_data_steward: { id: "market_data_steward", name: "Market Data Steward", description: "Validates timestamp, symbol, timeframe, completeness, and provenance of market data.", systemPrompt: "You are a market-data steward. Check symbol identity, asset class, timestamp freshness, candle continuity, duplicates, missing values, and source provenance before analysis.", tools: [dataProcessingTool, marketStreamSubscriptionTool, agenticWorkflowPlanTool], maxTokens: 3500 },
  screening_synthesizer: { id: "screening_synthesizer", name: "Screening Synthesizer", description: "Combines independent crypto and equity screens into a cautious comparative research brief.", systemPrompt: "You synthesize independent market screens. Preserve disagreement, rank evidence quality, state as-of times, avoid certainty, and include the finance disclaimer that screening is not investment advice.", tools: [textAnalysisTool, dataProcessingTool, agenticWorkflowPlanTool], maxTokens: 4500 },
  brainstormer: {
    id: "brainstormer",
    name: "Brainstormer",
    description: "Generates creative ideas, solves problems with lateral thinking, and facilitates ideation",
    systemPrompt: `You are a creative Brainstormer AI that helps generate and develop ideas.

Brainstorming techniques you use:
- **SCAMPER**: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse
- **Six Thinking Hats**: Look at problems from different angles
- **Mind Mapping**: Organize ideas around central themes
- **Reverse Brainstorming**: Think about how to cause the problem, then reverse
- **Random Entry**: Use random words/concepts to spark new connections

When brainstorming:
1. Generate a wide range of ideas (quantity over quality initially)
2. Combine and build on ideas
3. Provide practical and creative options
4. Rate ideas by feasibility and impact
5. Suggest next steps for the best ideas

Be enthusiastic, non-judgmental, and expansive in your thinking.`,
    tools: [webSearchTool, textAnalysisTool],
    maxTokens: 4e3
  }
};
function getAgentConfig(role) {
  const config = AGENTS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);
  return config;
}
function listAgents() {
  return Object.values(AGENTS).map(({ id, name, description }) => ({ id, name, description }));
}
async function executeToolCall(toolName, args, agentRole) {
  const permission = canInvokeTool(toolName, agentRole);
  if (!permission.allowed) return `Permission denied: ${permission.reason}`;
  try {
    switch (toolName) {
      case "advanced_strategy_backtest": {
        const data = Array.isArray(args.data) ? args.data : [];
        if (data.length < 60 || data.length > 1e4) return "Error: data must contain between 60 and 10000 candles";
        const strategyName = args.strategy ? String(args.strategy) : void 0;
        const strategy = BUILT_IN_STRATEGIES.find((item) => item.name === strategyName) ?? BUILT_IN_STRATEGIES[0];
        return JSON.stringify(runAutomatedBacktest(data, strategy, { commissionBps: Math.max(0, Math.min(500, Number(args.commissionBps ?? 0))), slippageBps: Math.max(0, Math.min(500, Number(args.slippageBps ?? 0))), walkForwardFolds: Math.max(0, Math.min(8, Number(args.walkForwardFolds ?? 0))) }));
      }
      case "market_stream_subscription": {
        const provider = String(args.provider ?? "coinbase");
        const symbols = Array.isArray(args.symbols) ? args.symbols.map(String).slice(0, 100) : [];
        if (!symbols.length) return "Error: symbols must contain at least one item";
        if (provider === "coinbase") return JSON.stringify({ url: "wss://advanced-trade-ws.coinbase.com", authRequired: false, payload: buildCoinbaseSubscription(symbols, String(args.channel ?? "ticker")) });
        if (provider === "massive") return JSON.stringify({ url: process.env.MASSIVE_WS_URL ?? null, authRequired: true, configured: Boolean(process.env.MASSIVE_WS_URL && process.env.MASSIVE_API_KEY), payload: buildMassiveSubscription(symbols, String(args.channel ?? "trades")) });
        return "Error: provider must be coinbase or massive";
      }
      case "market_screening_snapshot": {
        const assets = Array.isArray(args.assets) ? args.assets : [];
        if (!assets.length || assets.length > 100) return "Error: assets must contain between 1 and 100 items";
        const results = screenMarketAssets(assets, Array.isArray(args.indicators) ? args.indicators.map(String).slice(0, 20) : void 0);
        return JSON.stringify({ results, summary: marketScreenSummary(results) });
      }
      case "advanced_music_arrangement": {
        const operation = String(args.operation ?? "");
        const events = Array.isArray(args.events) ? args.events : [];
        if (events.length > 512) return "Error: events are limited to 512 notes";
        if (operation === "progression") return JSON.stringify(chordProgression(Number(args.root ?? 60), String(args.quality ?? "major") === "minor" ? "minor" : "major"));
        if (operation === "arpeggio") return JSON.stringify(arpeggiate(Array.isArray(args.notes) ? args.notes.map(Number).slice(0, 32) : [], String(args.pattern ?? "up"), 2));
        if (operation === "swing") return JSON.stringify(swingQuantize(events));
        if (operation === "humanize") return JSON.stringify(humanizeNotes(events, 0.01, 5, Number(args.seed ?? 17)));
        if (operation === "velocity") return JSON.stringify(velocityCurve(events));
        if (operation === "note_name") return midiNoteName(Number(args.root ?? 60));
        return "Error: unknown music arrangement operation";
      }
      case "technical_indicator_suite": {
        const data = Array.isArray(args.data) ? args.data : [];
        if (!data.length || data.length > 2e3) return "Error: data must contain between 1 and 2000 candles";
        const indicators = Array.isArray(args.indicators) ? args.indicators.map(String).slice(0, 30) : void 0;
        return JSON.stringify(indicatorSuite(data, indicators));
      }
      case "agentic_workflow_plan": {
        const goal = String(args.goal ?? "").trim();
        if (!goal || goal.length > 2e3) return "Error: goal must be between 1 and 2000 characters";
        const riskLevel = String(args.riskLevel ?? "medium");
        const constraints = Array.isArray(args.constraints) ? args.constraints.map(String).slice(0, 12) : [];
        return JSON.stringify({ goal, riskLevel, constraints, steps: [{ id: "scope", action: "Clarify objective, inputs, and success criteria", verification: "Inputs are explicit" }, { id: "plan", action: "Select the minimum permitted tools and specialist roles", verification: "All tools pass governance checks" }, { id: "execute", action: "Run bounded steps with observable outputs", verification: "Each step records success or failure" }, { id: "review", action: "Review uncertainty and side effects", verification: "No unsupported claims or unapproved mutations" }, { id: "rollback", action: "Prepare rollback or human approval when risk is non-low", verification: "A reversible fallback exists" }] });
      }
      case "forex_signal_snapshot": {
        const data = Array.isArray(args.data) ? args.data : [];
        return JSON.stringify(forexSignalSnapshot(data, Number(args.period ?? 14)));
      }
      case "forex_multi_timeframe": {
        const frames = Array.isArray(args.frames) ? args.frames : [];
        return JSON.stringify(multiTimeframeConfluence(frames));
      }
      case "create_synth_patch": {
        const patch = createSerumStylePatch({ name: String(args.name ?? "Nova Patch"), genre: args.genre ? String(args.genre) : void 0, mood: args.mood, tempo: args.tempo ? Number(args.tempo) : void 0, wavetable: args.wavetable ? String(args.wavetable) : void 0 });
        return JSON.stringify({ patch, analysis: analyzeSynthPatch(patch), modulationMatrix: createModulationMatrix(patch) });
      }
      case "calculator": {
        const expr = String(args.expression ?? "");
        const sanitized = expr.replace(/[^0-9+\-*/().%^\s]/g, "");
        if (!sanitized) return "Error: Invalid expression";
        try {
          const fn = new Function(`"use strict"; return (${sanitized});`);
          const result = fn();
          return `Result: ${result}`;
        } catch {
          return `Error: Could not evaluate expression: ${expr}`;
        }
      }
      case "text_analysis": {
        const text2 = String(args.text ?? "");
        const analysisType = String(args.analysisType ?? "all");
        const words = text2.split(/\s+/).filter(Boolean);
        const sentences = text2.split(/[.!?]+/).filter(Boolean);
        const chars = text2.length;
        const avgWordLength = words.length > 0 ? words.reduce((s, w) => s + w.length, 0) / words.length : 0;
        const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
        const positiveWords = ["good", "great", "excellent", "amazing", "love", "happy", "best", "perfect", "wonderful", "fantastic", "beautiful", "brilliant", "outstanding", "awesome", "superb"];
        const negativeWords = ["bad", "terrible", "horrible", "awful", "hate", "worst", "poor", "disappointing", "ugly", "disgusting", "dreadful", "miserable", "pathetic", "useless", "failure"];
        const lowerWords = words.map((w) => w.toLowerCase());
        const posCount = lowerWords.filter((w) => positiveWords.includes(w)).length;
        const negCount = lowerWords.filter((w) => negativeWords.includes(w)).length;
        const sentimentScore = lowerWords.length > 0 ? (posCount - negCount) / lowerWords.length : 0;
        const sentimentLabel = sentimentScore > 0.05 ? "positive" : sentimentScore < -0.05 ? "negative" : "neutral";
        const syllables = words.reduce((s, w) => s + (w.match(/[aeiouy]{1,2}/gi) || []).length, 0);
        const flesch = 206.835 - 1.015 * avgSentenceLength - 84.6 * (syllables / (words.length || 1));
        if (analysisType === "sentiment") {
          return JSON.stringify({ sentiment: sentimentLabel, score: Math.round(sentimentScore * 100) / 100, positiveWords: posCount, negativeWords: negCount });
        }
        if (analysisType === "readability") {
          return JSON.stringify({ fleschReadingEase: Math.round(flesch), gradeLevel: flesch > 90 ? "5th grade" : flesch > 70 ? "7th grade" : flesch > 50 ? "10th grade" : flesch > 30 ? "College" : "Graduate" });
        }
        if (analysisType === "statistics") {
          return JSON.stringify({ characters: chars, words: words.length, sentences: sentences.length, avgWordLength: Math.round(avgWordLength * 100) / 100, avgSentenceLength: Math.round(avgSentenceLength * 100) / 100 });
        }
        if (analysisType === "keywords") {
          const freq = {};
          const stopWords = /* @__PURE__ */ new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "about", "it", "this", "that", "and", "but", "or", "not", "no", "if", "then", "than", "so", "just", "very", "too", "also"]);
          for (const w of lowerWords) {
            if (w.length > 2 && !stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
          }
          const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));
          return JSON.stringify({ keywords });
        }
        return JSON.stringify({ sentiment: { label: sentimentLabel, score: Math.round(sentimentScore * 100) / 100 }, readability: { fleschReadingEase: Math.round(flesch) }, statistics: { characters: chars, words: words.length, sentences: sentences.length, avgWordLength: Math.round(avgWordLength * 100) / 100 }, keywords: Object.entries(lowerWords.reduce((freq, w) => {
          if (w.length > 2) freq[w] = (freq[w] || 0) + 1;
          return freq;
        }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10) });
      }
      case "code_execution": {
        const code = String(args.code ?? "");
        try {
          const result = await new Function(`"use strict"; return (async () => { ${code} })()`)();
          return String(result);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      case "data_processing": {
        const data = args.data;
        const operation = String(args.operation ?? "");
        const field = String(args.field ?? "");
        const value = String(args.value ?? "");
        if (!Array.isArray(data)) return "Error: data must be an array";
        switch (operation) {
          case "sort":
            return JSON.stringify([...data].sort((a, b) => {
              const va = a[field];
              const vb = b[field];
              if (typeof va === "number" && typeof vb === "number") return value === "desc" ? vb - va : va - vb;
              return String(va).localeCompare(String(vb));
            }));
          case "filter":
            return JSON.stringify(data.filter((item) => String(item[field]) === value));
          case "unique":
            return JSON.stringify([...new Set(data.map((item) => String(item[field])))]);
          case "stats": {
            const nums = data.map((item) => Number(item[field])).filter((n) => !isNaN(n));
            if (nums.length === 0) return "No numeric data found";
            const sorted = [...nums].sort((a, b) => a - b);
            const sum = nums.reduce((a, b) => a + b, 0);
            const mean4 = sum / nums.length;
            const median = nums.length % 2 === 0 ? (sorted[nums.length / 2 - 1] + sorted[nums.length / 2]) / 2 : sorted[Math.floor(nums.length / 2)];
            const variance = nums.reduce((s, n) => s + (n - mean4) ** 2, 0) / nums.length;
            const stdDev = Math.sqrt(variance);
            return JSON.stringify({ count: nums.length, sum: Math.round(sum * 100) / 100, mean: Math.round(mean4 * 100) / 100, median: Math.round(median * 100) / 100, stdDev: Math.round(stdDev * 100) / 100, min: sorted[0], max: sorted[sorted.length - 1] });
          }
          case "group": {
            const groups = {};
            for (const item of data) {
              const key = String(item[field] ?? "undefined");
              (groups[key] = groups[key] || []).push(item);
            }
            const result = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
            return JSON.stringify(result);
          }
          case "aggregate": {
            const nums = data.map((item) => Number(item[field])).filter((n) => !isNaN(n));
            return JSON.stringify({ count: nums.length, sum: Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100, avg: Math.round(nums.reduce((a, b) => a + b, 0) / (nums.length || 1) * 100) / 100 });
          }
          default:
            return `Error: Unknown operation: ${operation}`;
        }
      }
      case "web_search":
        return JSON.stringify({ status: "search_requested", query: args.query });
      default:
        return `Error: Unknown tool: ${toolName}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordToolFailure(toolName, message);
    return `Error: ${message}`;
  }
}
async function runAgent(role, userMessages, options) {
  const config = getAgentConfig(role);
  const maxSteps = options?.maxSteps ?? 5;
  const systemMessage = {
    role: "system",
    content: options?.context ? `${config.systemPrompt}

Additional context:
${options.context}` : config.systemPrompt
  };
  const messages2 = [
    systemMessage,
    ...userMessages.map((m) => ({ role: m.role, content: m.content }))
  ];
  const agentMessages = [];
  const toolResults = [];
  let stepsUsed = 0;
  let finalResponse = "";
  for (let step = 0; step < maxSteps; step++) {
    stepsUsed++;
    const response = await invokeLLM({
      model: options?.model ?? config.model,
      messages: messages2,
      tools: config.tools.length > 0 ? config.tools : void 0,
      toolChoice: config.tools.length > 0 ? "auto" : void 0,
      maxTokens: config.maxTokens ?? 2e3
    });
    const choice = response.choices[0];
    if (!choice) break;
    const assistantMsg = {
      role: "assistant",
      content: typeof choice.message.content === "string" ? choice.message.content : choice.message.content.map((p) => p.type === "text" ? p.text : "").join("")
    };
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      assistantMsg.toolCalls = choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.function.name, arguments: tc.function.arguments }
      }));
      agentMessages.push(assistantMsg);
      messages2.push({
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls
      });
      for (const tc of choice.message.tool_calls) {
        let args;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
        const result = await executeToolCall(tc.function.name, args, role);
        if (result.startsWith("Error:")) recordToolFailure(tc.function.name, result);
        else recordToolSuccess(tc.function.name);
        toolResults.push({ toolCallId: tc.id, toolName: tc.function.name, result });
        messages2.push({ role: "tool", name: tc.function.name, tool_call_id: tc.id, content: result });
      }
    } else {
      finalResponse = assistantMsg.content;
      agentMessages.push(assistantMsg);
      break;
    }
  }
  return {
    agentId: role,
    agentName: config.name,
    messages: agentMessages,
    toolResults,
    finalResponse,
    stepsUsed
  };
}

// server/_core/pipelines.ts
var BUILTIN_PIPELINES = [
  {
    id: "deep-research",
    name: "Deep Research",
    description: "Multi-step research pipeline: research \u2192 summarize \u2192 key findings",
    steps: [
      { id: "research", name: "Research", type: "agent", agentRole: "research_agent", prompt: "{input}", outputKey: "research_result" },
      { id: "summarize", name: "Summarize", type: "agent", agentRole: "summarizer", prompt: "Summarize the following research: {research_result}", outputKey: "summary" },
      { id: "findings", name: "Key Findings", type: "agent", agentRole: "data_analyst", prompt: "Extract the top 5 key findings and actionable insights from: {summary}", outputKey: "findings" }
    ],
    variables: {}
  },
  {
    id: "code-review-pipeline",
    name: "Code Review Pipeline",
    description: "Full code review: analyze metrics \u2192 detect issues \u2192 suggest refactors \u2192 generate docs",
    steps: [
      { id: "review", name: "Review Code", type: "agent", agentRole: "code_reviewer", prompt: "{input}", outputKey: "review" },
      { id: "refactor", name: "Suggest Improvements", type: "agent", agentRole: "code_reviewer", prompt: "Based on this review, provide specific refactoring suggestions with code examples:\n{review}", outputKey: "refactors" }
    ],
    variables: {}
  },
  {
    id: "content-creation",
    name: "Content Creation Pipeline",
    description: "Brainstorm \u2192 Draft \u2192 Edit \u2192 Final polish",
    steps: [
      { id: "brainstorm", name: "Brainstorm Ideas", type: "agent", agentRole: "brainstormer", prompt: "Generate creative ideas for: {input}", outputKey: "ideas" },
      { id: "draft", name: "Draft Content", type: "agent", agentRole: "writing_assistant", prompt: "Write a polished draft based on these ideas:\n{ideas}\n\nTopic: {input}", outputKey: "draft" },
      { id: "edit", name: "Edit & Polish", type: "agent", agentRole: "writing_assistant", prompt: "Review and improve this draft for clarity, flow, and impact:\n{draft}", outputKey: "final" }
    ],
    variables: {}
  },
  {
    id: "forex-analysis-pipeline",
    name: "Forex Analysis Pipeline",
    description: "Full market analysis: technical analysis \u2192 sentiment \u2192 strategy",
    steps: [
      { id: "analyze", name: "Technical Analysis", type: "agent", agentRole: "forex_analyst", prompt: "{input}", outputKey: "analysis" },
      { id: "strategy", name: "Strategy Recommendation", type: "agent", agentRole: "forex_analyst", prompt: "Based on this analysis, provide specific trading strategies with entry/exit points and risk management:\n{analysis}", outputKey: "strategy" }
    ],
    variables: {}
  },
  {
    id: "sound-design-pipeline",
    name: "Sound Design Pipeline",
    description: "Sound concept \u2192 synth patch architecture \u2192 production notes",
    steps: [
      { id: "concept", name: "Sound Concept", type: "agent", agentRole: "sound_designer", prompt: "{input}", outputKey: "concept" },
      { id: "patch", name: "Patch Architecture", type: "agent", agentRole: "sound_designer", prompt: "Turn this sound concept into a structured Serum-style patch and modulation plan:\n{concept}", outputKey: "patch" }
    ],
    variables: {}
  },
  {
    id: "quant-research-pipeline",
    name: "Quantitative Research Pipeline",
    description: "Market data inspection \u2192 multi-timeframe confluence \u2192 research caveats",
    steps: [
      { id: "analysis", name: "Advanced Analysis", type: "agent", agentRole: "quant_researcher", prompt: "{input}", outputKey: "analysis" },
      { id: "risk", name: "Risk Review", type: "agent", agentRole: "risk_manager", prompt: "Review this quantitative analysis for uncertainty, regime risk, drawdown sensitivity, and data limitations:\n{analysis}", outputKey: "risk_review" }
    ],
    variables: {}
  },
  {
    id: "risk-review-pipeline",
    name: "Risk Review Pipeline",
    description: "Scenario analysis \u2192 risk controls \u2192 uncertainty summary",
    steps: [
      { id: "scenario", name: "Scenario Review", type: "agent", agentRole: "risk_manager", prompt: "{input}", outputKey: "scenario" },
      { id: "research", name: "Quantitative Challenge", type: "agent", agentRole: "quant_researcher", prompt: "Challenge the following scenario with quantitative assumptions and failure cases:\n{scenario}", outputKey: "challenge" }
    ],
    variables: {}
  },
  {
    id: "music-production-pipeline",
    name: "Music Production Pipeline",
    description: "Musical brief \u2192 composition architecture \u2192 sound design \u2192 mix and export checklist",
    steps: [
      { id: "brief", name: "Production Brief", type: "agent", agentRole: "music_producer", prompt: "{input}", outputKey: "brief" },
      { id: "sound", name: "Sound Design", type: "agent", agentRole: "audio_engineer", prompt: "Turn this production brief into signal-chain, synth, spatial, and automation recommendations:\n{brief}", outputKey: "sound" },
      { id: "qa", name: "Export QA", type: "agent", agentRole: "qa_engineer", prompt: "Create a deterministic DAW export and mix QA checklist for:\n{sound}", outputKey: "qa" }
    ],
    variables: {}
  },
  {
    id: "market-structure-pipeline",
    name: "Market Structure Pipeline",
    description: "OHLCV brief \u2192 microstructure review \u2192 confluence \u2192 risk challenge",
    steps: [
      { id: "structure", name: "Structure Review", type: "agent", agentRole: "market_microstructure", prompt: "{input}", outputKey: "structure" },
      { id: "quant", name: "Quant Challenge", type: "agent", agentRole: "quant_researcher", prompt: "Challenge these observations with data-quality, regime, and execution assumptions:\n{structure}", outputKey: "quant" },
      { id: "risk", name: "Risk Review", type: "agent", agentRole: "risk_manager", prompt: "Summarize uncertainty and non-guaranteed risk controls for:\n{quant}", outputKey: "risk" }
    ],
    variables: {}
  },
  {
    id: "data-quality-pipeline",
    name: "Data Quality Pipeline",
    description: "Dataset intake \u2192 schema and quality review \u2192 reproducibility plan",
    steps: [
      { id: "profile", name: "Dataset Profile", type: "agent", agentRole: "data_engineer", prompt: "{input}", outputKey: "profile" },
      { id: "review", name: "Quality Review", type: "agent", agentRole: "data_analyst", prompt: "Identify missingness, outliers, leakage, and measurement risks in:\n{profile}", outputKey: "review" },
      { id: "plan", name: "Reproducibility Plan", type: "agent", agentRole: "data_engineer", prompt: "Create a versioned ingestion and validation plan based on:\n{review}", outputKey: "plan" }
    ],
    variables: {}
  },
  {
    id: "memory-curation-pipeline",
    name: "Memory Curation Pipeline",
    description: "Candidate context \u2192 privacy and retention review \u2192 durable-memory proposal",
    steps: [
      { id: "classify", name: "Classify Context", type: "agent", agentRole: "memory_architect", prompt: "{input}", outputKey: "classification" },
      { id: "privacy", name: "Privacy Review", type: "agent", agentRole: "qa_engineer", prompt: "Review this memory proposal for secrets, over-retention, and testable deletion requirements:\n{classification}", outputKey: "privacy" }
    ],
    variables: {}
  },
  {
    id: "release-qa-pipeline",
    name: "Release QA Pipeline",
    description: "Release brief \u2192 test matrix \u2192 deployment smoke checks \u2192 rollback criteria",
    steps: [
      { id: "matrix", name: "Test Matrix", type: "agent", agentRole: "qa_engineer", prompt: "{input}", outputKey: "matrix" },
      { id: "ops", name: "Operations Review", type: "agent", agentRole: "automation_orchestrator", prompt: "Turn this test matrix into deployment gates, observability, rollback, and human approval steps:\n{matrix}", outputKey: "ops" }
    ],
    variables: {}
  },
  {
    id: "translation-pipeline",
    name: "Translation & Localization",
    description: "Translate \u2192 Cultural adaptation \u2192 Quality check",
    steps: [
      { id: "translate", name: "Translate", type: "agent", agentRole: "translator", prompt: "{input}", outputKey: "translation" },
      { id: "review", name: "Quality Check", type: "agent", agentRole: "writing_assistant", prompt: "Review this translation for accuracy, fluency, and cultural appropriateness. Note any issues:\n{translation}", outputKey: "review" }
    ],
    variables: {}
  },
  {
    id: "song-creation",
    name: "Song Creation Pipeline",
    description: "Concept \u2192 Composition \u2192 Arrangement",
    steps: [
      { id: "concept", name: "Musical Concept", type: "agent", agentRole: "music_composer", prompt: "Create a musical concept and chord progression for: {input}", outputKey: "concept" },
      { id: "compose", name: "Full Composition", type: "agent", agentRole: "music_composer", prompt: "Based on this concept, create a complete composition with melody, bass, and arrangement:\n{concept}", outputKey: "composition" }
    ],
    variables: {}
  },
  {
    id: "multimodal-intake",
    name: "Multimodal Intake Pipeline",
    description: "Attachment or transcript intake \u2192 structured extraction \u2192 artifact-ready brief",
    steps: [
      { id: "extract", name: "Extract Context", type: "agent", agentRole: "data_analyst", prompt: "Extract entities, claims, decisions, and open questions from this attachment or transcript:\n{input}", outputKey: "extraction" },
      { id: "brief", name: "Create Brief", type: "agent", agentRole: "writing_assistant", prompt: "Turn this extracted context into a clear, source-aware working brief:\n{extraction}", outputKey: "brief" },
      { id: "qa", name: "Quality Review", type: "agent", agentRole: "qa_engineer", prompt: "Check this brief for unsupported claims, missing provenance, privacy risks, and ambiguous next steps:\n{brief}", outputKey: "qa" }
    ],
    variables: {}
  },
  {
    id: "model-evaluation-pipeline",
    name: "Model Evaluation Pipeline",
    description: "Evaluation prompt \u2192 independent review \u2192 regression and quality report",
    steps: [
      { id: "evaluate", name: "Evaluate Response", type: "agent", agentRole: "data_analyst", prompt: "Evaluate the supplied model response against the requested criteria and identify evidence:\n{input}", outputKey: "evaluation" },
      { id: "challenge", name: "Challenge Findings", type: "agent", agentRole: "research_agent", prompt: "Independently challenge the evaluation for bias, missing counterexamples, and reproducibility:\n{evaluation}", outputKey: "challenge" },
      { id: "report", name: "Quality Report", type: "agent", agentRole: "qa_engineer", prompt: "Produce a concise quality report with scores, limitations, and next tests:\n{evaluation}\n\nChallenge:\n{challenge}", outputKey: "report" }
    ],
    variables: {}
  },
  {
    id: "crypto-real-time-screen-pipeline",
    name: "Crypto Real-Time Collaborative Screen",
    description: "Fresh crypto OHLCV intake \u2192 data validation \u2192 independent technical screen \u2192 volatility and liquidity challenge \u2192 consensus brief.",
    steps: [
      { id: "data", name: "Validate Market Data", type: "agent", agentRole: "market_data_steward", prompt: "Validate the supplied crypto market data for symbol identity, timestamp freshness, timeframe, gaps, duplicates, and provenance. Do not fill missing prices.\n{input}", outputKey: "data_review" },
      { id: "technical", name: "Crypto Technical Screen", type: "agent", agentRole: "crypto_screening_analyst", prompt: "Run a descriptive technical screen on the supplied crypto OHLCV data. Report factors, uncertainty, and as-of timestamps. Do not make execution recommendations.\n{input}\n\nData review:\n{data_review}", outputKey: "technical_screen" },
      { id: "risk", name: "Crypto Regime and Risk Challenge", type: "agent", agentRole: "risk_manager", prompt: "Challenge this crypto screen for volatility, liquidity, regime shifts, stale data, and overfitting. Preserve disagreements and avoid forecasts.\n{technical_screen}", outputKey: "risk_review" },
      { id: "synthesis", name: "Crypto Consensus Brief", type: "agent", agentRole: "screening_synthesizer", prompt: "Synthesize the crypto screen and risk review into a cautious research brief with evidence, caveats, timestamp, and no-trade disclaimer.\nScreen:\n{technical_screen}\nRisk:\n{risk_review}", outputKey: "final" }
    ],
    variables: {}
  },
  {
    id: "equity-real-time-screen-pipeline",
    name: "Equity Real-Time Collaborative Screen",
    description: "Fresh equity OHLCV intake \u2192 exchange-session validation \u2192 independent technical screen \u2192 data-quality challenge \u2192 consensus brief.",
    steps: [
      { id: "data", name: "Validate Equity Data", type: "agent", agentRole: "market_data_steward", prompt: "Validate the supplied equity market data for ticker/exchange identity, session context, timestamp freshness, corporate-action caveats, gaps, duplicates, and provenance.\n{input}", outputKey: "data_review" },
      { id: "technical", name: "Equity Technical Screen", type: "agent", agentRole: "equity_screening_analyst", prompt: "Run a descriptive technical screen on the supplied equity OHLCV data. Report factors, uncertainty, session assumptions, and as-of timestamps. Do not make execution recommendations.\n{input}\n\nData review:\n{data_review}", outputKey: "technical_screen" },
      { id: "risk", name: "Equity Risk Challenge", type: "agent", agentRole: "risk_manager", prompt: "Challenge this equity screen for data quality, liquidity, corporate actions, regime changes, and false precision. Preserve disagreements and avoid forecasts.\n{technical_screen}", outputKey: "risk_review" },
      { id: "synthesis", name: "Equity Consensus Brief", type: "agent", agentRole: "screening_synthesizer", prompt: "Synthesize the equity screen and risk review into a cautious research brief with evidence, caveats, timestamp, and no-trade disclaimer.\nScreen:\n{technical_screen}\nRisk:\n{risk_review}", outputKey: "final" }
    ],
    variables: {}
  },
  {
    id: "reliability-incident-pipeline",
    name: "Reliability Incident Pipeline",
    description: "Incident signal \u2192 failure analysis \u2192 mitigations \u2192 runbook",
    steps: [
      { id: "triage", name: "Triage Signal", type: "agent", agentRole: "qa_engineer", prompt: "Triage this incident signal and separate symptoms, impact, and unknowns:\n{input}", outputKey: "triage" },
      { id: "root-cause", name: "Root Cause Review", type: "agent", agentRole: "data_engineer", prompt: "Analyze this triage for likely root causes, observability gaps, and safe reproduction steps:\n{triage}", outputKey: "root_cause" },
      { id: "runbook", name: "Runbook", type: "agent", agentRole: "automation_orchestrator", prompt: "Create a cautious mitigation and rollback runbook based on:\n{root_cause}", outputKey: "runbook" }
    ],
    variables: {}
  }
];
function listPipelines() {
  return BUILTIN_PIPELINES.map((p) => ({ id: p.id, name: p.name, description: p.description, stepCount: p.steps.length }));
}
function getPipeline(id) {
  return BUILTIN_PIPELINES.find((p) => p.id === id);
}
function substituteVars(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
async function executePipeline(pipelineId, input, options) {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);
  const startTime = Date.now();
  const vars = { ...pipeline.variables, input };
  const stepResults = [];
  let finalOutput = input;
  for (const step of pipeline.steps) {
    const stepStart = Date.now();
    try {
      switch (step.type) {
        case "agent": {
          if (!step.agentRole) throw new Error(`Agent step '${step.id}' missing agentRole`);
          const prompt = substituteVars(step.prompt ?? "{input}", vars);
          const result = await runAgent(step.agentRole, [{ role: "user", content: prompt }], {
            model: options?.model,
            maxSteps: options?.maxStepsPerAgent ?? 3
          });
          const output = result.finalResponse;
          if (step.outputKey) vars[step.outputKey] = output;
          finalOutput = output;
          stepResults.push({ stepId: step.id, stepName: step.name, status: "success", output, duration: Date.now() - stepStart });
          break;
        }
        case "llm": {
          const prompt = substituteVars(step.prompt ?? "", vars);
          const response = await invokeLLM({
            model: options?.model,
            messages: [{ role: "user", content: prompt }]
          });
          const content = response.choices[0]?.message.content;
          const output = typeof content === "string" ? content : content.map((p) => p.type === "text" ? p.text : "").join("");
          if (step.outputKey) vars[step.outputKey] = output;
          finalOutput = output;
          stepResults.push({ stepId: step.id, stepName: step.name, status: "success", output, duration: Date.now() - stepStart });
          break;
        }
        case "transform": {
          if (!step.transformFn) throw new Error(`Transform step '${step.id}' missing transformFn`);
          const fn = new Function("vars", `"use strict"; return (${step.transformFn})`);
          const output = fn(vars);
          if (step.outputKey) vars[step.outputKey] = output;
          finalOutput = output;
          stepResults.push({ stepId: step.id, stepName: step.name, status: "success", output, duration: Date.now() - stepStart });
          break;
        }
        default:
          stepResults.push({ stepId: step.id, stepName: step.name, status: "skipped", duration: Date.now() - stepStart });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      stepResults.push({ stepId: step.id, stepName: step.name, status: "error", error: errorMsg, duration: Date.now() - stepStart });
      return {
        pipelineId,
        success: false,
        steps: stepResults,
        finalOutput: null,
        totalDuration: Date.now() - startTime
      };
    }
  }
  return {
    pipelineId,
    success: true,
    steps: stepResults,
    finalOutput,
    totalDuration: Date.now() - startTime
  };
}

// server/_core/backendTools.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
var categories = [
  "security",
  "observability",
  "automation",
  "data",
  "ai",
  "collaboration",
  "integration",
  "compliance",
  "performance",
  "reliability",
  "developer-experience",
  "workflow",
  "analytics",
  "governance",
  "storage",
  "messaging",
  "billing",
  "admin"
];
var capabilityTemplates = [
  "policy-aware orchestration",
  "adaptive workflow routing",
  "tenant-scoped auditability",
  "predictive anomaly detection",
  "self-healing operations",
  "privacy-preserving summarization",
  "event-driven automation",
  "semantic retrieval",
  "cost-aware optimization",
  "zero-trust access control",
  "data quality scoring",
  "real-time collaboration",
  "change-impact simulation",
  "release readiness validation",
  "resilience testing"
];
var readinessChecklist = [
  "typed API contract",
  "input validation",
  "tenant isolation",
  "audit events",
  "operational metrics",
  "error handling",
  "documentation",
  "automated tests"
];
function generateFeatureCatalog(count, offset = 0) {
  if (!Number.isInteger(count) || count < 1 || count > 2e4) {
    throw new Error("count must be an integer from 1 to 20000");
  }
  return Array.from({ length: count }, (_, index2) => {
    const n = offset + index2 + 1;
    const category = categories[n % categories.length];
    const capability = capabilityTemplates[n % capabilityTemplates.length];
    const priority = n % 37 === 0 ? "critical" : n % 11 === 0 ? "high" : n % 3 === 0 ? "low" : "normal";
    return {
      id: `nova-${category}-${String(n).padStart(5, "0")}`,
      category,
      title: `${category.replace(/-/g, " ")} ${capability} capability ${n}`,
      capability: `Adds ${capability} for ${category} use cases with production controls and measurable rollout criteria.`,
      priority,
      readinessChecklist: readinessChecklist.slice(
        0,
        4 + n % (readinessChecklist.length - 3)
      )
    };
  });
}
var redactPatterns = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["phone", /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g],
  ["api_key", /\b(?:sk|pk|rk|api)[-_]?[A-Za-z0-9]{20,}\b/g],
  ["credit_card", /\b(?:\d[ -]*?){13,19}\b/g]
];
function redactSensitiveText(text2) {
  let redacted = text2;
  const findings = [];
  for (const [type, pattern] of redactPatterns) {
    let count = 0;
    redacted = redacted.replace(pattern, () => {
      count += 1;
      return `[REDACTED_${type.toUpperCase()}]`;
    });
    if (count > 0) findings.push({ type, count });
  }
  return { redacted, findings };
}
function chunkText(text2, maxChars = 1200, overlap = 120) {
  if (maxChars < 100 || maxChars > 8e3)
    throw new Error("maxChars must be between 100 and 8000");
  if (overlap < 0 || overlap >= maxChars)
    throw new Error("overlap must be non-negative and smaller than maxChars");
  const chunks = [];
  let cursor = 0;
  while (cursor < text2.length) {
    const end = Math.min(cursor + maxChars, text2.length);
    const chunk = text2.slice(cursor, end);
    chunks.push({
      id: randomUUID(),
      index: chunks.length,
      text: chunk,
      sha256: createHash2("sha256").update(chunk).digest("hex")
    });
    if (end === text2.length) break;
    cursor = end - overlap;
  }
  return { chunks, count: chunks.length, totalChars: text2.length };
}
function evaluateServiceHealth(metrics) {
  const score = Math.max(
    0,
    Math.min(
      100,
      100 - metrics.latencyMs / 20 - metrics.errorRate * 400 - metrics.saturation * 30 - (metrics.queueDepth ?? 0) / 50
    )
  );
  const status = score >= 90 ? "excellent" : score >= 75 ? "healthy" : score >= 55 ? "degraded" : "critical";
  const recommendations = [
    metrics.latencyMs > 1e3 ? "Add caching, query optimization, or asynchronous processing for high-latency paths." : null,
    metrics.errorRate > 0.02 ? "Inspect recent deployments and upstream dependencies because error rate is above 2%." : null,
    metrics.saturation > 0.75 ? "Scale workers or reduce concurrency because saturation is above 75%." : null,
    (metrics.queueDepth ?? 0) > 500 ? "Drain or shard queues because backlog is above 500 items." : null
  ].filter((item) => Boolean(item));
  return { score: Math.round(score), status, recommendations };
}
function createRunbook(input) {
  return {
    id: `runbook-${createHash2("sha1").update(`${input.service}:${input.symptom}`).digest("hex").slice(0, 10)}`,
    service: input.service,
    severity: input.severity,
    objective: `Restore ${input.service} when ${input.symptom} is observed.`,
    steps: [
      "Confirm customer impact and declare incident ownership.",
      "Inspect health, logs, traces, dependency status, and recent deploys.",
      "Apply the safest mitigation: rollback, feature flag disablement, queue pause, or capacity increase.",
      "Validate recovery with synthetic checks and user-visible metrics.",
      "Publish a post-incident review with root cause, timeline, and prevention tasks."
    ]
  };
}
function evaluateTokenBucket(input) {
  const requestedTokens = input.requestedTokens ?? 1;
  if (input.capacity < 1) throw new Error("capacity must be positive");
  if (input.refillPerSecond <= 0)
    throw new Error("refillPerSecond must be positive");
  if (requestedTokens < 1) throw new Error("requestedTokens must be positive");
  const now = input.now ?? /* @__PURE__ */ new Date();
  const refilled = Math.min(
    input.capacity,
    Math.max(0, input.currentTokens) + input.elapsedMs / 1e3 * input.refillPerSecond
  );
  const allowed = refilled >= requestedTokens;
  const nextTokens = allowed ? refilled - requestedTokens : refilled;
  const missing = Math.max(0, requestedTokens - refilled);
  const retryAfterMs = allowed ? 0 : Math.ceil(missing / input.refillPerSecond * 1e3);
  return {
    allowed,
    limit: input.capacity,
    remaining: Math.floor(nextTokens),
    resetAt: new Date(now.getTime() + retryAfterMs).toISOString(),
    retryAfterMs,
    nextTokens
  };
}
function buildCachePolicy(input) {
  const ttlByVolatility = {
    static: 86400,
    daily: 21600,
    hourly: 900,
    realtime: 15
  };
  const ttlSeconds = input.userScoped ? Math.min(300, ttlByVolatility[input.volatility]) : ttlByVolatility[input.volatility];
  const staleWhileRevalidateSeconds = Math.max(30, Math.round(ttlSeconds / 2));
  const visibility = input.userScoped ? "private" : "public";
  const tags = [input.resource, ...input.tags ?? []].map((tag) => tag.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")).filter(Boolean);
  return {
    ttlSeconds,
    staleWhileRevalidateSeconds,
    cacheControl: `${visibility}, max-age=${ttlSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`,
    surrogateKey: tags.join(" "),
    vary: input.userScoped ? ["authorization", "cookie"] : ["accept-encoding"]
  };
}
function evaluateCircuitBreaker(input) {
  const minimumSamples = input.minimumSamples ?? 20;
  const failureThreshold = input.failureThreshold ?? 0.5;
  const cooldownMs = input.cooldownMs ?? 3e4;
  const total = input.successes + input.failures;
  const failureRate = total === 0 ? 0 : input.failures / total;
  const now = input.now ?? /* @__PURE__ */ new Date();
  if (input.openedAt) {
    const openedAt = new Date(input.openedAt);
    const nextCheck = new Date(openedAt.getTime() + cooldownMs);
    if (now < nextCheck) {
      return {
        state: "open",
        allowRequest: false,
        failureRate,
        nextCheckAt: nextCheck.toISOString(),
        reason: "Circuit is cooling down after crossing the failure threshold."
      };
    }
    return {
      state: "half_open",
      allowRequest: true,
      failureRate,
      reason: "Cooldown elapsed; allow a limited probe request."
    };
  }
  if (total >= minimumSamples && failureRate >= failureThreshold) {
    return {
      state: "open",
      allowRequest: false,
      failureRate,
      nextCheckAt: new Date(now.getTime() + cooldownMs).toISOString(),
      reason: "Observed failure rate crossed the configured threshold."
    };
  }
  return {
    state: "closed",
    allowRequest: true,
    failureRate,
    reason: "Failure rate is within policy."
  };
}
function planWorkflowExecution(steps) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  if (byId.size !== steps.length)
    throw new Error("workflow step ids must be unique");
  const indegree = /* @__PURE__ */ new Map();
  const outgoing = /* @__PURE__ */ new Map();
  for (const step of steps) {
    indegree.set(step.id, step.dependsOn?.length ?? 0);
    for (const dependency of step.dependsOn ?? []) {
      if (!byId.has(dependency))
        throw new Error(`unknown dependency: ${dependency}`);
      outgoing.set(dependency, [...outgoing.get(dependency) ?? [], step.id]);
    }
  }
  const ready = Array.from(indegree.entries()).filter(([, degree]) => degree === 0).map(([id]) => id);
  const order = [];
  const waves = [];
  while (ready.length > 0) {
    const wave = ready.splice(0).sort();
    waves.push(wave);
    for (const id of wave) {
      order.push(id);
      for (const child of outgoing.get(id) ?? []) {
        indegree.set(child, (indegree.get(child) ?? 0) - 1);
        if (indegree.get(child) === 0) ready.push(child);
      }
    }
  }
  if (order.length !== steps.length)
    throw new Error("workflow contains a cycle");
  const earliestFinish = /* @__PURE__ */ new Map();
  let criticalPathMs = 0;
  for (const id of order) {
    const step = byId.get(id);
    let dependencyFinishMs = 0;
    for (const dependency of step.dependsOn ?? []) {
      dependencyFinishMs = Math.max(
        dependencyFinishMs,
        earliestFinish.get(dependency) ?? 0
      );
    }
    const finishMs = dependencyFinishMs + (step.durationMs ?? 0);
    earliestFinish.set(id, finishMs);
    criticalPathMs = Math.max(criticalPathMs, finishMs);
  }
  return {
    order,
    waves,
    criticalPathMs,
    parallelism: waves.reduce(
      (maxParallelism, wave) => Math.max(maxParallelism, wave.length),
      0
    )
  };
}
function evaluateFeatureFlag(input) {
  if (input.rolloutPercent < 0 || input.rolloutPercent > 100)
    throw new Error("rolloutPercent must be between 0 and 100");
  if (input.denyList?.includes(input.subjectId))
    return { enabled: false, bucket: 0, reason: "subject is deny-listed" };
  if (input.allowList?.includes(input.subjectId))
    return { enabled: true, bucket: 0, reason: "subject is allow-listed" };
  if (input.enabled === false)
    return { enabled: false, bucket: 0, reason: "flag is globally disabled" };
  const hash = createHash2("sha256").update(`${input.flagKey}:${input.subjectId}`).digest("hex");
  const bucket = Number.parseInt(hash.slice(0, 8), 16) % 100;
  return {
    enabled: bucket < input.rolloutPercent,
    bucket,
    reason: "deterministic percentage rollout"
  };
}
function createIdempotencyKey(input) {
  const payload = JSON.stringify({
    method: input.method.toUpperCase(),
    path: input.path,
    tenantId: input.tenantId ?? null,
    body: input.body
  });
  return createHash2("sha256").update(payload).digest("hex");
}
function scoreDataQuality(rows) {
  if (rows.length === 0)
    return { score: 100, rowCount: 0, columns: [], issues: [] };
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const issues = [];
  let penalties = 0;
  for (const column of columns) {
    const values = rows.map((row) => row[column]);
    const missing = values.filter(
      (value) => value === null || value === void 0 || value === ""
    ).length;
    if (missing > 0) {
      const rate = missing / rows.length;
      penalties += rate * 20;
      issues.push(`${column} is missing in ${Math.round(rate * 100)}% of rows`);
    }
    const uniqueTypes = new Set(
      values.filter((value) => value !== null && value !== void 0).map((value) => Array.isArray(value) ? "array" : typeof value)
    );
    if (uniqueTypes.size > 1) {
      penalties += 10;
      issues.push(
        `${column} has mixed types: ${Array.from(uniqueTypes).join(", ")}`
      );
    }
  }
  const duplicateRows = rows.length - new Set(rows.map((row) => JSON.stringify(row))).size;
  if (duplicateRows > 0) {
    penalties += duplicateRows / rows.length * 15;
    issues.push(`${duplicateRows} duplicate row(s) detected`);
  }
  return {
    score: Math.max(0, Math.round(100 - penalties)),
    rowCount: rows.length,
    columns,
    issues
  };
}
function buildAuditEvent(input) {
  const occurredAt = input.occurredAt ?? /* @__PURE__ */ new Date();
  const event = {
    id: randomUUID(),
    actorId: input.actorId,
    action: input.action,
    resource: input.resource,
    metadata: input.metadata ?? {},
    occurredAt: occurredAt.toISOString()
  };
  return {
    ...event,
    signature: createHash2("sha256").update(JSON.stringify(event)).digest("hex")
  };
}
function planCapacity(input) {
  if (input.targetCpuUtilization <= 0 || input.targetCpuUtilization > 1)
    throw new Error("targetCpuUtilization must be > 0 and <= 1");
  const requiredRps = input.currentRps * input.peakMultiplier;
  const effectiveRpsPerInstance = input.rpsPerInstance * input.targetCpuUtilization;
  const instances = Math.max(
    input.minimumInstances ?? 1,
    Math.ceil(requiredRps / effectiveRpsPerInstance)
  );
  return {
    requiredRps,
    effectiveRpsPerInstance,
    recommendedInstances: instances,
    headroomRps: instances * effectiveRpsPerInstance - requiredRps
  };
}
function evaluateSlo(input) {
  if (input.target <= 0 || input.target >= 1)
    throw new Error("target must be between 0 and 1");
  if (input.totalEvents < input.goodEvents)
    throw new Error("totalEvents cannot be smaller than goodEvents");
  const actual = input.totalEvents === 0 ? 1 : input.goodEvents / input.totalEvents;
  const errorBudget = 1 - input.target;
  const consumed = input.totalEvents === 0 ? 0 : (input.totalEvents - input.goodEvents) / (input.totalEvents * errorBudget);
  const status = actual >= input.target ? "within_budget" : "breached";
  return {
    target: input.target,
    actual,
    status,
    errorBudgetConsumedPercent: Math.round(consumed * 100),
    windowDays: input.windowDays ?? 30
  };
}
function buildRetryPolicy(input) {
  if (input.maxAttempts < 1) throw new Error("maxAttempts must be positive");
  if (input.baseDelayMs < 1 || input.maxDelayMs < input.baseDelayMs) {
    throw new Error("delay bounds are invalid");
  }
  const jitterRatio = input.jitterRatio ?? 0.2;
  const schedule = Array.from({ length: input.maxAttempts }, (_, index2) => {
    const delayMs = Math.min(input.maxDelayMs, input.baseDelayMs * 2 ** index2);
    return {
      attempt: index2 + 1,
      delayMs: index2 === 0 ? 0 : delayMs,
      minDelayMs: index2 === 0 ? 0 : Math.max(0, Math.round(delayMs * (1 - jitterRatio))),
      maxDelayMs: index2 === 0 ? 0 : Math.round(delayMs * (1 + jitterRatio))
    };
  });
  return { maxAttempts: input.maxAttempts, schedule };
}
function evaluateAccessPolicy(input) {
  const reasons = [];
  if (input.resource.ownerId && input.resource.ownerId === input.subject.id)
    reasons.push("subject owns resource");
  const matchingRoles = (input.resource.requiredRoles ?? []).filter(
    (role) => input.subject.roles.includes(role)
  );
  if (matchingRoles.length > 0)
    reasons.push(`subject has required role(s): ${matchingRoles.join(", ")}`);
  if (input.subject.roles.includes("admin")) reasons.push("subject is admin");
  const allowed = reasons.length > 0;
  return {
    allowed,
    effect: allowed ? "allow" : "deny",
    action: input.action,
    reasons: allowed ? reasons : ["no ownership, admin role, or required role matched"]
  };
}
function scanSecrets(text2) {
  const patterns = [
    ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/g],
    ["jwt", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g],
    ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    [
      "generic_token",
      /\b(?:token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/gi
    ]
  ];
  const findings = patterns.flatMap(([type, pattern]) => {
    const matches = Array.from(text2.matchAll(pattern));
    return matches.map((match) => ({
      type,
      index: match.index ?? 0,
      preview: `${match[0].slice(0, 6)}\u2026${match[0].slice(-4)}`
    }));
  });
  return { safe: findings.length === 0, findings, count: findings.length };
}
function planPagination(input) {
  const maxPageSize = input.maxPageSize ?? 500;
  const pageSize = Math.min(Math.max(1, input.pageSize), maxPageSize);
  const totalPages = Math.max(1, Math.ceil(input.totalItems / pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalItems: input.totalItems,
    totalPages,
    offset,
    limit: pageSize,
    hasPrevious: page > 1,
    hasNext: page < totalPages
  };
}
function compareApiVersions(input) {
  const key = (endpoint) => `${endpoint.method.toUpperCase()} ${endpoint.path}`;
  const previous = new Map(
    input.previous.map((endpoint) => [key(endpoint), endpoint])
  );
  const next = new Map(input.next.map((endpoint) => [key(endpoint), endpoint]));
  const removedEndpoints = Array.from(previous.keys()).filter(
    (endpointKey) => !next.has(endpointKey)
  );
  const addedEndpoints = Array.from(next.keys()).filter(
    (endpointKey) => !previous.has(endpointKey)
  );
  const fieldChanges = Array.from(next.entries()).flatMap(
    ([endpointKey, endpoint]) => {
      const oldEndpoint = previous.get(endpointKey);
      if (!oldEndpoint) return [];
      const removedFields = oldEndpoint.responseFields.filter(
        (field) => !endpoint.responseFields.includes(field)
      );
      const addedFields = endpoint.responseFields.filter(
        (field) => !oldEndpoint.responseFields.includes(field)
      );
      return removedFields.length || addedFields.length ? [{ endpoint: endpointKey, removedFields, addedFields }] : [];
    }
  );
  return {
    breaking: removedEndpoints.length > 0 || fieldChanges.some((change) => change.removedFields.length > 0),
    removedEndpoints,
    addedEndpoints,
    fieldChanges
  };
}
function forecastUsageCost(input) {
  if (input.months < 1 || input.months > 60)
    throw new Error("months must be between 1 and 60");
  const forecast = Array.from({ length: input.months }, (_, index2) => {
    const month = index2 + 1;
    const units = input.currentUnits * (1 + input.growthRate) ** index2;
    return {
      month,
      units: Math.round(units),
      cost: Number((units * input.unitCost).toFixed(2))
    };
  });
  const totalCost = Number(
    forecast.reduce((sum, item) => sum + item.cost, 0).toFixed(2)
  );
  return {
    forecast,
    totalCost,
    averageMonthlyCost: Number((totalCost / input.months).toFixed(2))
  };
}
function analyzeDependencyRisk(dependencies) {
  const results = dependencies.map((dependency) => {
    const vulnerabilityPenalty = (dependency.criticalVulnerabilities ?? 0) * 35;
    const freshnessPenalty = dependency.daysSinceUpdate > 365 ? 25 : dependency.daysSinceUpdate > 180 ? 15 : dependency.daysSinceUpdate > 90 ? 5 : 0;
    const transitivePenalty = dependency.direct === false ? 5 : 0;
    const riskScore = Math.min(
      100,
      vulnerabilityPenalty + freshnessPenalty + transitivePenalty
    );
    const risk = riskScore >= 70 ? "critical" : riskScore >= 35 ? "high" : riskScore >= 15 ? "medium" : "low";
    return { ...dependency, riskScore, risk };
  });
  return {
    dependencies: results,
    highestRisk: results.reduce(
      (max, item) => Math.max(max, item.riskScore),
      0
    ),
    requiresAction: results.some((item) => item.riskScore >= 35)
  };
}
function planMaintenanceWindow(input) {
  const canaryPercent = input.canaryPercent ?? 5;
  const canaryUsers = Math.ceil(input.impactedUsers * (canaryPercent / 100));
  return {
    durationMinutes: input.durationMinutes,
    regions: input.regions,
    phases: [
      {
        name: "preflight",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.15)),
        users: 0
      },
      {
        name: "canary",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.25)),
        users: canaryUsers
      },
      {
        name: "regional_rollout",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.45)),
        users: input.impactedUsers - canaryUsers
      },
      {
        name: "validation",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.15)),
        users: input.impactedUsers
      }
    ],
    rollbackTrigger: "Rollback if error rate doubles, p95 latency increases by 50%, or canary health checks fail twice."
  };
}
function summarizeEventStream(events) {
  const byType = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});
  const bySeverity = events.reduce((acc, event) => {
    const severity = event.severity ?? "info";
    acc[severity] = (acc[severity] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = [...events].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp)
  );
  return {
    total: events.length,
    byType,
    bySeverity,
    firstEventAt: sorted[0]?.timestamp ?? null,
    lastEventAt: sorted.at(-1)?.timestamp ?? null
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/runtimeConfig.ts
var present = (value) => Boolean(value?.trim());
var countKeys = (prefix) => {
  const values = [process.env[`${prefix}_API_KEYS`], process.env[`${prefix}_KEYS`], process.env[`${prefix}_API_KEY`]];
  for (let index2 = 1; index2 <= 50; index2 += 1) values.push(process.env[`${prefix}_${index2}`]);
  return [...new Set(values.flatMap((value) => (value ?? "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean)))].length;
};
function runtimeConfigurationStatus() {
  const providers = [
    { id: "gemini", label: "Gemini", keyCount: countKeys("GEMINI"), model: ENV.geminiModel, baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
    { id: "groq", label: "Groq", keyCount: countKeys("GROQ"), model: ENV.groqModel, baseUrl: "https://api.groq.com/openai/v1" },
    { id: "ollama-cloud", label: "Ollama Cloud", keyCount: countKeys("OLLAMA_CLOUD"), model: ENV.ollamaCloudModel, baseUrl: ENV.ollamaCloudBaseUrl },
    { id: "openrouter", label: "OpenRouter", keyCount: countKeys("OPENROUTER"), model: ENV.openrouterModel, baseUrl: ENV.openrouterBaseUrl }
  ].map((item) => ({ ...item, configured: item.keyCount > 0 }));
  const connections = [
    { id: "kaggle", label: "Kaggle", keyCount: countKeys("KAGGLE") },
    { id: "firecrawl", label: "Firecrawl", keyCount: countKeys("FIRECRAWL") },
    { id: "e2b", label: "E2B", keyCount: countKeys("E2B") }
  ].map((item) => ({ ...item, configured: item.keyCount > 0 }));
  const checks = {
    authentication: present(ENV.cookieSecret) && present(ENV.passwordHash),
    aiRouting: providers.some((provider) => provider.configured) || present(ENV.forgeApiKey),
    persistence: present(ENV.databaseUrl) || present(ENV.supabaseUrl) && present(ENV.supabaseAnonKey),
    optionalConnections: connections.some((connection) => connection.configured)
  };
  return {
    environment: { production: ENV.isProduction, vercel: present(process.env.VERCEL), nodeVersion: process.version },
    providers,
    connections,
    data: {
      database: present(ENV.databaseUrl),
      supabase: present(ENV.supabaseUrl) && present(ENV.supabaseAnonKey),
      cloudflareWorker: present(ENV.cloudflareWorkerUrl),
      massiveMarketData: present(ENV.massiveWsUrl) && present(ENV.massiveApiKey)
    },
    auth: { passwordOnly: present(ENV.passwordHash), sessionSecret: present(ENV.cookieSecret) },
    routing: { providerOrder: ENV.providerOrder },
    readiness: { overall: Object.values(checks).every(Boolean) ? "ready" : "degraded", checks }
  };
}
function runtimeReadinessSnapshot() {
  const status = runtimeConfigurationStatus();
  return { ok: status.readiness.overall === "ready", service: "nova-chat", timestamp: (/* @__PURE__ */ new Date()).toISOString(), environment: status.environment, readiness: status.readiness, providerCount: status.providers.filter((provider) => provider.configured).length, connectionCount: status.connections.filter((connection) => connection.configured).length };
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  readiness: publicProcedure.query(() => runtimeReadinessSnapshot()),
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/_core/music.ts
var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11]
};
var CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  diminished7: [0, 3, 6, 9],
  halfDim7: [0, 3, 6, 10],
  augmented7: [0, 4, 8, 10],
  add9: [0, 4, 7, 14],
  major9: [0, 4, 7, 11, 14],
  minor9: [0, 3, 7, 10, 14],
  dominant9: [0, 4, 7, 10, 14],
  major11: [0, 4, 7, 11, 14, 17],
  minor11: [0, 3, 7, 10, 14, 17],
  dominant13: [0, 4, 7, 10, 14, 21],
  power: [0, 7]
};
function midiToNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTES[midi % 12];
  return `${note}${octave}`;
}
function noteToMidi(note) {
  const match = note.match(/^([A-G]#?)(\d)$/);
  if (!match) throw new Error(`Invalid note format: ${note}`);
  const noteIndex = NOTES.indexOf(match[1]);
  if (noteIndex === -1) throw new Error(`Unknown note: ${match[1]}`);
  return (parseInt(match[2]) + 1) * 12 + noteIndex;
}
function getScaleNotes(root, scaleName) {
  const intervals = SCALES[scaleName];
  if (!intervals) throw new Error(`Unknown scale: ${scaleName}. Available: ${Object.keys(SCALES).join(", ")}`);
  const rootIndex = NOTES.indexOf(root);
  return intervals.map((interval) => NOTES[(rootIndex + interval) % 12]);
}
function getChordNotes(root, chordType) {
  const intervals = CHORD_TYPES[chordType];
  if (!intervals) throw new Error(`Unknown chord type: ${chordType}. Available: ${Object.keys(CHORD_TYPES).join(", ")}`);
  const rootIndex = NOTES.indexOf(root);
  return intervals.map((interval) => NOTES[(rootIndex + interval) % 12]);
}
function getScaleChords(root, scaleName) {
  const scaleIntervals = SCALES[scaleName];
  if (!scaleIntervals) throw new Error(`Unknown scale: ${scaleName}`);
  const rootIndex = NOTES.indexOf(root);
  const degreeNames = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
  const result = [];
  for (let i = 0; i < scaleIntervals.length; i++) {
    const noteIndex = (rootIndex + scaleIntervals[i]) % 12;
    const note = NOTES[noteIndex];
    let type = "major";
    if (i + 1 < scaleIntervals.length && i + 2 < scaleIntervals.length) {
      const third = (scaleIntervals[i + 2] - scaleIntervals[i]) % 12;
      const fifth = (scaleIntervals[i + 4] - scaleIntervals[i]) % 12;
      if (third === 3 && fifth === 7) type = "minor";
      else if (third === 3 && fifth === 6) type = "diminished";
      else if (third === 4 && fifth === 8) type = "augmented";
    }
    result.push({
      chord: `${note}`,
      degree: degreeNames[i] || `${i + 1}`,
      type
    });
  }
  return result;
}
function generateChordProgression(root, scaleName, degrees = [1, 4, 5, 1], variations = true) {
  const scaleChords = getScaleChords(root, scaleName);
  return degrees.map((degree) => {
    const idx = Math.max(0, Math.min(degree - 1, scaleChords.length - 1));
    const sc = scaleChords[idx];
    const notes = getChordNotes(sc.chord, sc.type);
    let suffix = "";
    if (variations) {
      const r = Math.random();
      if (r < 0.15) suffix = "7";
      else if (r < 0.25) suffix = "sus4";
      else if (r < 0.3) suffix = "add9";
    }
    return {
      chord: sc.chord,
      symbol: `${sc.chord}${sc.type === "minor" ? "m" : sc.type === "diminished" ? "dim" : sc.type === "augmented" ? "aug" : ""}${suffix}`,
      notes: suffix ? getChordNotes(sc.chord, suffix === "7" ? sc.type === "minor" ? "minor7" : "dominant7" : suffix) : notes
    };
  });
}
function generateMelody(root, scaleName, length = 16, octaveRange = [4, 5]) {
  const scaleNotes2 = getScaleNotes(root, scaleName);
  const durations = ["quarter", "quarter", "quarter", "eighth", "eighth", "half", "quarter"];
  const melody = [];
  let prevNoteIndex = Math.floor(scaleNotes2.length / 2);
  for (let i = 0; i < length; i++) {
    const step = Math.random() < 0.7 ? Math.random() < 0.5 ? 1 : -1 : Math.random() < 0.5 ? 2 : -2;
    prevNoteIndex = Math.max(0, Math.min(scaleNotes2.length - 1, prevNoteIndex + step));
    const note = scaleNotes2[prevNoteIndex];
    const octave = octaveRange[0] + Math.floor(Math.random() * (octaveRange[1] - octaveRange[0] + 1));
    const midi = noteToMidi(`${note}${octave}`);
    melody.push({
      note: `${note}${octave}`,
      midi,
      duration: durations[Math.floor(Math.random() * durations.length)],
      velocity: 60 + Math.floor(Math.random() * 40)
    });
  }
  const lastNote = scaleNotes2[0];
  melody[melody.length - 1] = { note: `${lastNote}${octaveRange[0]}`, midi: noteToMidi(`${lastNote}${octaveRange[0]}`), duration: "half", velocity: 70 };
  return melody;
}
function generateBassLine(chordProgression2, pattern = "root") {
  const bassNotes = [];
  for (const chord of chordProgression2) {
    const root = chord.notes[0];
    const rootMidi = noteToMidi(`${root}2`);
    switch (pattern) {
      case "root":
        bassNotes.push({ note: `${root}2`, midi: rootMidi, duration: "whole" });
        break;
      case "walking": {
        const scale = [0, 2, 4, 5, 7, 9, 11];
        for (let i = 0; i < 4; i++) {
          const noteIndex = (NOTES.indexOf(root) + scale[i % scale.length]) % 12;
          const note = NOTES[noteIndex];
          bassNotes.push({ note: `${note}2`, midi: noteToMidi(`${note}2`), duration: "quarter" });
        }
        break;
      }
      case "octave":
        bassNotes.push({ note: `${root}2`, midi: rootMidi, duration: "half" });
        bassNotes.push({ note: `${root}3`, midi: rootMidi + 12, duration: "half" });
        break;
    }
  }
  return bassNotes;
}
function generateDrumPattern(style = "rock", bars = 4, stepsPerBar = 16) {
  const patterns = {
    rock: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false]
    },
    jazz: {
      ride: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, true],
      kick: [true, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false],
      snare: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
    },
    hiphop: {
      kick: [false, false, false, false, false, false, true, false, false, false, true, false, false, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]
    },
    electronic: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat: [true, false, true, false, true, false, true, false, true, false, true, true, true, false, true, false],
      bass: [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false]
    },
    latin: {
      kick: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, true],
      snare: [false, false, false, false, true, false, false, true, false, false, false, false, true, false, false, false],
      hihat: [true, false, true, true, false, true, true, false, true, true, false, true, true, false, true, false],
      cowbell: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, true]
    }
  };
  const stylePattern = patterns[style] || patterns.rock;
  return Object.entries(stylePattern).map(([instrument, pattern]) => ({
    instrument,
    pattern: Array.from({ length: bars * stepsPerBar }, (_, i) => !!pattern[i % pattern.length])
  }));
}
function melodyToABC(melody, title = "Nova Composition", composer = "Nova AI", meter = "4/4", tempo = 120) {
  const durationMap = {
    "whole": "1",
    "half": "2",
    "quarter": "",
    "eighth": "8",
    "sixteenth": "16"
  };
  const noteMap = {
    "C": "C",
    "C#": "^C",
    "D": "D",
    "D#": "^D",
    "E": "E",
    "F": "F",
    "F#": "^F",
    "G": "G",
    "G#": "^G",
    "A": "A",
    "A#": "^A",
    "B": "B"
  };
  let abc = `X:1
T:${title}
C:${composer}
M:${meter}
Q:1/4=${tempo}
K:C
`;
  for (const item of melody) {
    const noteName = item.note.replace(/\d/g, "");
    const octave = parseInt(item.note.replace(/[^0-9]/g, "")) || 4;
    let abcNote = noteMap[noteName] || noteName;
    if (octave < 4) abcNote = abcNote.toLowerCase().repeat(4 - octave);
    else if (octave > 4) abcNote = abcNote.toUpperCase().repeat(octave - 4);
    else abcNote = abcNote.toLowerCase();
    const dur = durationMap[item.duration] || "";
    abc += `${abcNote}${dur} `;
  }
  return abc.trim() + "\n";
}
function generateSong(root = "C", scaleName = "major", style = "pop", sections = ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]) {
  const sectionChordDegrees = {
    intro: [1, 4, 5, 4],
    verse: [1, 5, 6, 4],
    chorus: [4, 5, 1, 1],
    bridge: [6, 4, 1, 5],
    outro: [1, 4, 1, 1]
  };
  const tempos = { rock: 120, jazz: 140, pop: 110, electronic: 128, classical: 90 };
  const songSections = sections.map((sectionName) => {
    const degrees = sectionChordDegrees[sectionName] || [1, 4, 5, 1];
    const chords = generateChordProgression(root, scaleName, degrees, false);
    const melody = generateMelody(root, scaleName, 16);
    const bass = generateBassLine(chords, "walking");
    const drumStyle = style === "pop" || style === "classical" ? "rock" : style;
    const drums = generateDrumPattern(drumStyle, 2);
    return { name: sectionName, chords, melody, bass, drums };
  });
  const allMelody = songSections.flatMap((s) => s.melody);
  return {
    title: `Nova ${style.charAt(0).toUpperCase() + style.slice(1)} in ${root} ${scaleName}`,
    key: root,
    scale: scaleName,
    tempo: tempos[style] || 120,
    timeSignature: "4/4",
    sections: songSections,
    abcNotation: melodyToABC(allMelody, `Nova ${style} Song`, "Nova AI")
  };
}

// server/_core/dawExport.ts
var clamp3 = (value, min = 0, max = 127) => Math.max(min, Math.min(max, Math.round(value)));
var normalizedToCc = (value) => clamp3(value * 127);
function exportMidiCcMap(patch) {
  const normalized = patch;
  const mappings = [
    { cc: 1, name: "Modulation", destination: "lfo-1.amount", min: 0, max: 1, value: normalizedToCc(normalized.lfos[0]?.amount ?? 0) },
    { cc: 2, name: "Breath / Movement", destination: "filter.cutoff", min: 20, max: 2e4, value: clamp3((normalized.filter.cutoffHz - 20) / 19980 * 127) },
    { cc: 16, name: "Macro Movement", destination: normalized.macroControls[0]?.name ?? "macro-1", min: 0, max: 1, value: 64 },
    { cc: 17, name: "Macro Impact", destination: normalized.macroControls[1]?.name ?? "macro-2", min: 0, max: 1, value: 64 },
    { cc: 71, name: "Resonance", destination: "filter.resonance", min: 0, max: 1, value: normalizedToCc(normalized.filter.resonance) },
    { cc: 74, name: "Brightness", destination: "filter.cutoff", min: 20, max: 2e4, value: clamp3((normalized.filter.cutoffHz - 20) / 19980 * 127) },
    { cc: 75, name: "Envelope Attack", destination: "env-amp.attack", min: 0, max: 10, value: clamp3(normalized.envelopes.amp.attack / 10 * 127) },
    { cc: 76, name: "Envelope Release", destination: "env-amp.release", min: 0, max: 15, value: clamp3(normalized.envelopes.amp.release / 15 * 127) }
  ];
  return { format: "midi-cc-map", version: 1, patchName: normalized.name, channel: 1, mappings, instructions: ["Send MIDI CC values on channel 1.", "CC 74 and CC 71 are standard brightness/resonance controls.", "CC 16 and CC 17 are generic macro lanes; map them to the destination names in your DAW or synth."], disclaimer: "MIDI CC destinations vary by instrument and DAW. Verify mappings before recording automation." };
}
function exportSerumStylePreset(patch) {
  const normalized = patch;
  return {
    format: "serum-style-json",
    version: 1,
    compatibility: { target: "Xfer Serum-style", exactBinaryFxp: false, reason: "Serum .fxp is a proprietary binary preset format; this manifest preserves the musical and modulation parameters for a dedicated plugin adapter." },
    metadata: { name: normalized.name, author: "Nova", genre: normalized.genre, tempo: normalized.tempo, tags: normalized.tags },
    oscA: normalized.oscillators[0] ? { wavetable: normalized.oscillators[0].wavetable ?? normalized.oscillators[0].wave, octave: normalized.oscillators[0].octave, semitones: normalized.oscillators[0].semitones, fine: normalized.oscillators[0].fine, unison: normalized.oscillators[0].unison, detune: normalized.oscillators[0].detune, level: normalized.oscillators[0].level } : null,
    oscB: normalized.oscillators[1] ? { wavetable: normalized.oscillators[1].wavetable ?? normalized.oscillators[1].wave, octave: normalized.oscillators[1].octave, semitones: normalized.oscillators[1].semitones, fine: normalized.oscillators[1].fine, unison: normalized.oscillators[1].unison, detune: normalized.oscillators[1].detune, level: normalized.oscillators[1].level } : null,
    noise: normalized.noise ?? null,
    filter: normalized.filter,
    envelopes: normalized.envelopes,
    lfos: normalized.lfos,
    modulationMatrix: normalized.modulation,
    effects: normalized.effects,
    macros: normalized.macroControls,
    notes: normalized.notes
  };
}
function exportDawBundle(patch) {
  return { format: "nova-daw-bundle", version: 1, patch: exportSerumStylePreset(patch), midi: exportMidiCcMap(patch), files: [{ name: `${patch.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-patch"}.serum-style.json`, mediaType: "application/json" }, { name: `${patch.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-patch"}.midi-cc.json`, mediaType: "application/json" }] };
}

// server/_core/codeTools.ts
function analyzeMetrics(code, language = "typescript") {
  const lines = code.split("\n");
  const linesOfCode = lines.length;
  const blankLines = lines.filter((l) => l.trim() === "").length;
  const commentPatterns = {
    typescript: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    javascript: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    python: [/#.*$/, /'''[\s\S]*?'''/, /"""[\s\S]*?"""/],
    java: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    go: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    rust: [/\/\/.*$/]
  };
  const patterns = commentPatterns[language] || commentPatterns.typescript;
  const commentLines = lines.filter((l) => patterns.some((p) => p.test(l.trim()))).length;
  const funcPatterns = {
    typescript: /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    javascript: /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    python: /def\s+(\w+)\s*\(/g,
    java: /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/g,
    go: /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/g,
    rust: /fn\s+(\w+)\s*\(/g
  };
  const funcPattern = funcPatterns[language] || funcPatterns.typescript;
  const functions = [];
  let match;
  const funcRegex = new RegExp(funcPattern.source, funcPattern.flags);
  while ((match = funcRegex.exec(code)) !== null) {
    const name = match[1] || match[2];
    if (name) {
      const lineNum = code.substring(0, match.index).split("\n").length;
      const params = (match[0].match(/,/g) || []).length + 1;
      functions.push({ name, line: lineNum, complexity: 0, params });
    }
  }
  const importPatterns = {
    typescript: /^import\s+.+from\s+['"]([^'"]+)['"]/gm,
    javascript: /^import\s+.+from\s+['"]([^'"]+)['"]/gm,
    python: /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm,
    java: /^import\s+(.+);/gm,
    go: /^import\s+(?:\(\n?([\s\S]*?)\n?\)|(\S+))/gm,
    rust: /^use\s+(.+);/gm
  };
  const importPattern = importPatterns[language] || importPatterns.typescript;
  const imports = [];
  const importRegex = new RegExp(importPattern.source, importPattern.flags);
  while ((match = importRegex.exec(code)) !== null) {
    imports.push((match[1] || match[2] || match[0]).trim());
  }
  const exportRegex = /export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type)\s+(\w+)/g;
  const exports = [];
  while ((match = exportRegex.exec(code)) !== null) {
    exports.push(match[1]);
  }
  const complexityKeywords = /\b(if|else|for|while|do|case|catch|\?|&&|\|\|)\b/g;
  const complexityMatches = code.match(complexityKeywords);
  const complexity = complexityMatches ? complexityMatches.length : 0;
  const mi = Math.max(0, Math.min(100, 171 - 5.2 * Math.log(linesOfCode) - 0.23 * complexity - 16.2 * Math.log(1 + commentLines)));
  return { linesOfCode, blankLines, commentLines, complexity, maintainabilityIndex: Math.round(mi), functions, imports, exports };
}
function detectIssues(code, language = "typescript") {
  const issues = [];
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (/console\.(log|debug|info|warn|error)\s*\(/.test(trimmed)) {
      issues.push({ line: i + 1, severity: "warning", message: "Console statement found in production code", rule: "no-console", fix: "Remove or replace with proper logging" });
    }
    if (/\/\/\s*TODO/i.test(trimmed) || /#\s*TODO/i.test(trimmed)) {
      issues.push({ line: i + 1, severity: "info", message: "TODO comment found", rule: "todo-comment" });
    }
    if (language === "typescript" && /:\s*any\b/.test(trimmed)) {
      issues.push({ line: i + 1, severity: "warning", message: "Avoid using `any` type", rule: "no-any", fix: "Replace with a specific type" });
    }
    if (/catch\s*\(\w*\)\s*\{\s*\}/.test(trimmed) || /catch\s*\{\s*\}/.test(trimmed)) {
      issues.push({ line: i + 1, severity: "error", message: "Empty catch block - errors are silently swallowed", rule: "no-empty-catch", fix: "Add error handling or re-throw" });
    }
    if ((trimmed.match(/\?/g) || []).length > 1) {
      issues.push({ line: i + 1, severity: "warning", message: "Nested ternary operator detected - reduce readability", rule: "no-nested-ternary", fix: "Use if/else or extract to a function" });
    }
    if (/[^.\d](\d{2,})[^.\d,;)}\]]/.test(trimmed) && !/^(?:const|let|var)\s+\w+\s*=\s*\d/.test(trimmed) && !/\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      issues.push({ line: i + 1, severity: "hint", message: "Magic number detected - consider extracting to a named constant", rule: "no-magic-numbers" });
    }
    const indent = line.match(/^\s*/)?.[0].length || 0;
    if (indent > 24) {
      issues.push({ line: i + 1, severity: "warning", message: `Deep nesting detected (${Math.floor(indent / 2)} levels) - consider extracting`, rule: "max-depth" });
    }
    if (trimmed.length > 120) {
      issues.push({ line: i + 1, severity: "info", message: `Line is ${trimmed.length} characters long (max 120)`, rule: "max-line-length" });
    }
    if (/^(?:const|let|var)\s+(\w+)\s*=/.test(trimmed)) {
      const varMatch = trimmed.match(/^(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        const varName = varMatch[1];
        const count = code.split(varName).length - 1;
        if (count <= 1) {
          issues.push({ line: i + 1, severity: "warning", message: `Variable '${varName}' appears to be unused`, rule: "no-unused-vars" });
        }
      }
    }
    if (language === "typescript" && /[^!=]==[^=]/.test(trimmed) && !/===/.test(trimmed)) {
      issues.push({ line: i + 1, severity: "warning", message: "Use === instead of ==", rule: "eqeqeq", fix: "Replace == with ===" });
    }
  });
  return issues;
}
function suggestRefactors(code, language = "typescript") {
  const suggestions = [];
  const lines = code.split("\n");
  const metrics = analyzeMetrics(code, language);
  for (const func of metrics.functions) {
    if (func.complexity > 10 || func.params > 5) {
      suggestions.push({
        type: "extract_function",
        title: `Extract '${func.name}' into smaller functions`,
        description: `This function has high complexity or too many parameters. Breaking it into smaller, focused functions will improve readability and testability.`,
        line: func.line,
        impact: "high"
      });
    }
  }
  lines.forEach((line, i) => {
    const indent = line.match(/^\s*/)?.[0].length || 0;
    if (indent > 20) {
      suggestions.push({
        type: "reduce_nesting",
        title: "Reduce nesting level",
        description: `Code at line ${i + 1} is deeply nested. Consider using early returns, guard clauses, or extracting to a function.`,
        line: i + 1,
        impact: "medium"
      });
    }
  });
  if (language === "typescript") {
    const untypedFunctions = code.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\()[^)]*\)(?!\s*:)/g);
    if (untypedFunctions) {
      suggestions.push({
        type: "add_types",
        title: "Add return type annotations",
        description: `${untypedFunctions.length} function(s) may be missing explicit return type annotations. Adding types improves documentation and catches errors.`,
        impact: "medium"
      });
    }
  }
  if (metrics.linesOfCode > 300) {
    suggestions.push({
      type: "split_file",
      title: "Consider splitting this file",
      description: `This file has ${metrics.linesOfCode} lines. Consider splitting into modules based on responsibility.`,
      impact: "medium"
    });
  }
  const tryCatchCount = (code.match(/try\s*{/g) || []).length;
  const asyncAwaitCount = (code.match(/await\s+/g) || []).length;
  if (asyncAwaitCount > 0 && tryCatchCount === 0) {
    suggestions.push({
      type: "error_handling",
      title: "Add error handling for async operations",
      description: `${asyncAwaitCount} await(s) found but no try/catch blocks. Unhandled promise rejections may crash the application.`,
      impact: "high"
    });
  }
  const complexConditions = code.match(/if\s*\([^)]{100,}\)/g);
  if (complexConditions) {
    suggestions.push({
      type: "simplify_condition",
      title: "Simplify complex conditions",
      description: `${complexConditions.length} complex condition(s) found. Extract to well-named boolean variables or functions.`,
      impact: "medium"
    });
  }
  return suggestions;
}
function convertCode(code, fromLang, toLang) {
  const notes = [];
  let converted = code;
  if ((fromLang === "typescript" || fromLang === "javascript") && toLang === "python") {
    converted = converted.replace(/\/\/\s*(.+)/g, "# $1").replace(/const\s+(\w+)\s*=/g, "$1 =").replace(/let\s+(\w+)\s*=/g, "$1 =").replace(/function\s+(\w+)\s*\(([^)]*)\)\s*{/g, "def $1($2):").replace(/if\s*\((.+)\)\s*{/g, "if $1:").replace(/console\.log\((.+)\)/g, "print($1)").replace(/===/g, "==").replace(/!==/g, "!=").replace(/true/g, "True").replace(/false/g, "False").replace(/null|undefined/g, "None").replace(/\.length/g, "len()").replace(/\{\s*\}/g, "pass").replace(/\}/g, "").replace(/;\s*$/gm, "");
    notes.push("Basic pattern conversion. Manual review required for production use.");
    notes.push("Type annotations, async/await, and class syntax need manual conversion.");
  } else if (fromLang === "python" && (toLang === "typescript" || toLang === "javascript")) {
    converted = converted.replace(/#\s*(.+)/g, "// $1").replace(/def\s+(\w+)\s*\(([^)]*)\):/g, "function $1($2) {").replace(/elif\s+(.+):/g, "} else if ($1) {").replace(/else:/g, "} else {").replace(/if\s+(.+):/g, "if ($1) {").replace(/print\((.+)\)/g, "console.log($1)").replace(/==/g, "===").replace(/!=/g, "!==").replace(/True/g, "true").replace(/False/g, "false").replace(/None/g, "null").replace(/len\((\w+)\)/g, "$1.length").replace(/pass/g, "{}");
    notes.push("Basic pattern conversion. Manual review required for production use.");
    notes.push("Python-specific features (decorators, generators, list comprehensions) need manual conversion.");
  } else {
    notes.push("Direct conversion not supported between these languages. Use LLM-assisted conversion instead.");
  }
  return { original: code, converted, fromLanguage: fromLang, toLanguage: toLang, notes };
}
function generateDocumentation(code, language = "typescript") {
  const metrics = analyzeMetrics(code, language);
  const issues = detectIssues(code, language);
  let doc = `# Code Analysis Report

`;
  doc += `## Metrics

`;
  doc += `| Metric | Value |
|---|---|
`;
  doc += `| Lines of Code | ${metrics.linesOfCode} |
`;
  doc += `| Blank Lines | ${metrics.blankLines} |
`;
  doc += `| Comment Lines | ${metrics.commentLines} |
`;
  doc += `| Cyclomatic Complexity | ${metrics.complexity} |
`;
  doc += `| Maintainability Index | ${metrics.maintainabilityIndex}/100 |
`;
  doc += `| Functions | ${metrics.functions.length} |
`;
  doc += `| Imports | ${metrics.imports.length} |
`;
  doc += `| Exports | ${metrics.exports.length} |

`;
  if (metrics.functions.length > 0) {
    doc += `## Functions

`;
    doc += `| Name | Line | Parameters |
|---|---|---|
`;
    for (const func of metrics.functions) {
      doc += `| \`${func.name}\` | ${func.line} | ${func.params} |
`;
    }
    doc += "\n";
  }
  if (issues.length > 0) {
    doc += `## Issues (${issues.length})

`;
    for (const issue of issues.slice(0, 20)) {
      const icon = issue.severity === "error" ? "\u274C" : issue.severity === "warning" ? "\u26A0\uFE0F" : "\u{1F4A1}";
      doc += `- ${icon} Line ${issue.line}: ${issue.message} (${issue.rule})
`;
    }
    doc += "\n";
  }
  const refactors = suggestRefactors(code, language);
  if (refactors.length > 0) {
    doc += `## Refactoring Suggestions

`;
    for (const r of refactors) {
      const impactIcon = r.impact === "high" ? "\u{1F534}" : r.impact === "medium" ? "\u{1F7E1}" : "\u{1F7E2}";
      doc += `### ${impactIcon} ${r.title}
${r.description}

`;
    }
  }
  return doc;
}
function generateTestStubs(code, language = "typescript") {
  const metrics = analyzeMetrics(code, language);
  if (metrics.functions.length === 0) return "No functions found to generate tests for.";
  const testFrameworks = {
    typescript: { import: "import { describe, it, expect } from 'vitest';", assert: "expect", describe: "describe", it: "it" },
    javascript: { import: "import { describe, it, expect } from 'vitest';", assert: "expect", describe: "describe", it: "it" },
    python: { import: "import pytest", assert: "assert", describe: "class", it: "def test" },
    java: { import: "import org.junit.jupiter.api.*;", assert: "assertEquals", describe: "@Nested", it: "@Test" },
    go: { import: 'import "testing"', assert: "assert", describe: "func Test", it: "t.Run" }
  };
  const fw = testFrameworks[language] || testFrameworks.typescript;
  let output = `${fw.import}

`;
  for (const func of metrics.functions) {
    if (language === "python") {
      output += `${fw.it}_{func.name}():
    # Arrange
    # Act
    result = ${func.name}()
    # Assert
    ${fw.assert} result is not None

`;
    } else if (language === "go") {
      output += `${fw.describe}${func.name.charAt(0).toUpperCase() + func.name.slice(1)}(t *testing.T) {
	${fw.it}("should work correctly", func(t *testing.T) {
		// Arrange
		// Act
		// Assert
		${fw.assert}(true)
	})
}

`;
    } else {
      output += `${fw.describe}('${func.name}', () => {
	${fw.it}('should work correctly', () => {
		// Arrange
		// Act
		// Assert
		${fw.assert}(true).toBe(true);
	});

	${fw.it}('should handle edge cases', () => {
		// Arrange
		// Act
		// Assert
		${fw.assert}(true).toBeDefined();
	});
});

`;
    }
  }
  return output;
}
function regexHelper(input) {
  const commonPatterns = [
    { pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", description: "Email address" },
    { pattern: "^(https?:\\/\\/)?([\\da-z\\.-]+)\\.([a-z\\.]{2,6})([\\/\\w \\-]*)*\\/?$", description: "URL" },
    { pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date (YYYY-MM-DD)" },
    { pattern: "^\\+?[1-9]\\d{1,14}$", description: "Phone number (E.164)" },
    { pattern: "^#[0-9a-fA-F]{3,8}$", description: "Hex color" },
    { pattern: "^(\\d{1,3}\\.){3}\\d{1,3}$", description: "IPv4 address" },
    { pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", description: "UUID" }
  ];
  for (const cp of commonPatterns) {
    const regex = new RegExp(cp.pattern);
    const test = regex.test(input);
    if (test) {
      const matches = input.match(regex) || [];
      return { pattern: cp.pattern, description: cp.description, test: true, matches };
    }
  }
  return { pattern: "", description: "No common pattern matched", test: false, matches: [] };
}

// server/_core/swarmConsensus.ts
var SWARM_AGENTS = [
  // Trend agents
  { id: "trend_sma_20", name: "SMA(20) Trend", category: "trend", indicator: "sma", params: { period: 20 }, weight: 1.5 },
  { id: "trend_sma_50", name: "SMA(50) Trend", category: "trend", indicator: "sma", params: { period: 50 }, weight: 1.2 },
  { id: "trend_ema_12", name: "EMA(12) Trend", category: "trend", indicator: "ema", params: { period: 12 }, weight: 1.3 },
  { id: "trend_ema_26", name: "EMA(26) Trend", category: "trend", indicator: "ema", params: { period: 26 }, weight: 1 },
  { id: "trend_ema_cross", name: "EMA Cross 12/26", category: "trend", indicator: "ema_cross", params: { fast: 12, slow: 26 }, weight: 2 },
  { id: "trend_adx", name: "ADX(14)", category: "trend", indicator: "adx", params: { period: 14 }, weight: 1.8 },
  // Momentum agents
  { id: "mom_rsi_14", name: "RSI(14)", category: "momentum", indicator: "rsi", params: { period: 14 }, weight: 2 },
  { id: "mom_rsi_7", name: "RSI(7)", category: "momentum", indicator: "rsi", params: { period: 7 }, weight: 1.5 },
  { id: "mom_macd", name: "MACD(12,26,9)", category: "momentum", indicator: "macd", params: { fast: 12, slow: 26, signal: 9 }, weight: 2 },
  { id: "mom_stoch", name: "Stochastic(14,3)", category: "momentum", indicator: "stochastic", params: { kPeriod: 14, dPeriod: 3 }, weight: 1.5 },
  { id: "mom_cci_20", name: "CCI(20)", category: "momentum", indicator: "cci", params: { period: 20 }, weight: 1.2 },
  { id: "mom_williams", name: "Williams %R(14)", category: "momentum", indicator: "williams_r", params: { period: 14 }, weight: 1 },
  // Volatility agents
  { id: "vol_atr_14", name: "ATR(14)", category: "volatility", indicator: "atr", params: { period: 14 }, weight: 1.5 },
  { id: "vol_bb_20", name: "Bollinger Bands(20,2)", category: "volatility", indicator: "bollinger", params: { period: 20, stdDev: 2 }, weight: 2 },
  { id: "vol_bb_width", name: "BB Width(20)", category: "volatility", indicator: "bb_width", params: { period: 20, stdDev: 2 }, weight: 1 },
  { id: "vol_keltner", name: "Keltner Channel(20)", category: "volatility", indicator: "keltner", params: { period: 20 }, weight: 1.2 },
  // Volume agents
  { id: "vol_obv", name: "OBV", category: "volume", indicator: "obv", params: {}, weight: 1.5 },
  { id: "vol_vwap", name: "VWAP", category: "volume", indicator: "vwap", params: {}, weight: 1.5 },
  { id: "vol_mfi", name: "MFI(14)", category: "volume", indicator: "mfi", params: { period: 14 }, weight: 1.2 }
];
function executeAgent(agent, data) {
  const closes2 = data.map((d) => d.close);
  const lastPrice = closes2[closes2.length - 1];
  let signal = "NEUTRAL";
  let strength = 0;
  let value = 0;
  switch (agent.indicator) {
    case "sma": {
      const vals = sma4(closes2, agent.params.period);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        strength = Math.min(Math.abs(lastPrice - value) / value * 100, 1);
        signal = lastPrice > value ? "BUY" : "SELL";
      }
      break;
    }
    case "ema": {
      const vals = ema3(closes2, agent.params.period);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        strength = Math.min(Math.abs(lastPrice - value) / value * 100, 1);
        signal = lastPrice > value ? "BUY" : "SELL";
      }
      break;
    }
    case "ema_cross": {
      const fast = ema3(closes2, agent.params.fast);
      const slow = ema3(closes2, agent.params.slow);
      const offset = agent.params.slow - agent.params.fast;
      if (fast.length > offset + 1 && slow.length > 1) {
        const fastVal = fast[fast.length - 1];
        const prevFast = fast[fast.length - 2];
        const slowVal = slow[slow.length - 1];
        const prevSlow = slow[slow.length - 2];
        value = fastVal - slowVal;
        strength = Math.min(Math.abs(value) / lastPrice * 100, 1);
        if (prevFast <= prevSlow && fastVal > slowVal) signal = "BUY";
        else if (prevFast >= prevSlow && fastVal < slowVal) signal = "SELL";
      }
      break;
    }
    case "rsi": {
      const vals = rsi2(closes2, agent.params.period);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        strength = Math.abs(value - 50) / 50;
        if (value < 30) signal = "BUY";
        else if (value > 70) signal = "SELL";
      }
      break;
    }
    case "macd": {
      const { histogram } = macd2(closes2, agent.params.fast, agent.params.slow, agent.params.signal);
      if (histogram.length > 1) {
        value = histogram[histogram.length - 1];
        strength = Math.min(Math.abs(value) / lastPrice * 100, 1);
        signal = value > 0 ? "BUY" : "SELL";
      }
      break;
    }
    case "stochastic": {
      const { k, d } = stochastic2(data, agent.params.kPeriod, agent.params.dPeriod);
      if (k.length > 0 && d.length > 0) {
        value = k[k.length - 1];
        strength = Math.abs(value - 50) / 50;
        signal = k[k.length - 1] > d[d.length - 1] && value < 80 ? "BUY" : k[k.length - 1] < d[d.length - 1] && value > 20 ? "SELL" : "NEUTRAL";
      }
      break;
    }
    case "cci": {
      const vals = cci2(data, agent.params.period);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        strength = Math.min(Math.abs(value) / 200, 1);
        if (value < -100) signal = "BUY";
        else if (value > 100) signal = "SELL";
      }
      break;
    }
    case "williams_r": {
      const vals = williamsR2(data, agent.params.period);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        strength = Math.abs(value + 50) / 50;
        if (value < -80) signal = "BUY";
        else if (value > -20) signal = "SELL";
      }
      break;
    }
    case "adx": {
      const { adx: adxVals, plusDI, minusDI } = adx2(data, agent.params.period);
      if (adxVals.length > 0 && plusDI.length > 0 && minusDI.length > 0) {
        const aIdx = adxVals.length - 1;
        const pDI = plusDI[plusDI.length - 1];
        const mDI = minusDI[minusDI.length - 1];
        value = adxVals[aIdx];
        strength = value / 50;
        signal = pDI > mDI && value > 20 ? "BUY" : mDI > pDI && value > 20 ? "SELL" : "NEUTRAL";
      }
      break;
    }
    case "atr": {
      const vals = atr2(data, agent.params.period);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        const avg3 = vals.reduce((a, b) => a + b, 0) / vals.length;
        strength = Math.min(value / (avg3 || 1), 1);
        signal = value > avg3 ? "SELL" : "BUY";
      }
      break;
    }
    case "bollinger": {
      const bb = bollingerBands2(closes2, agent.params.period, agent.params.stdDev);
      if (bb.upper.length > 0 && bb.lower.length > 0) {
        const u = bb.upper[bb.upper.length - 1];
        const l = bb.lower[bb.lower.length - 1];
        value = bb.pctB[bb.pctB.length - 1];
        strength = Math.abs(value - 0.5) * 2;
        if (lastPrice <= l) signal = "BUY";
        else if (lastPrice >= u) signal = "SELL";
      }
      break;
    }
    case "bb_width": {
      const bb = bollingerBands2(closes2, agent.params.period, agent.params.stdDev);
      if (bb.bandwidth.length > 0) {
        value = bb.bandwidth[bb.bandwidth.length - 1];
        const avg3 = bb.bandwidth.reduce((a, b) => a + b, 0) / bb.bandwidth.length;
        strength = Math.min(value / (avg3 || 1) / 2, 1);
        signal = "NEUTRAL";
      }
      break;
    }
    case "keltner": {
      const bb = bollingerBands2(closes2, agent.params.period, 1.5);
      if (bb.upper.length > 0 && bb.lower.length > 0) {
        value = bb.pctB[bb.pctB.length - 1];
        strength = Math.abs(value - 0.5) * 2;
        if (lastPrice <= bb.lower[bb.lower.length - 1]) signal = "BUY";
        else if (lastPrice >= bb.upper[bb.upper.length - 1]) signal = "SELL";
      }
      break;
    }
    case "obv": {
      const vals = obv2(data);
      if (vals.length > 1) {
        value = vals[vals.length - 1] - vals[vals.length - 2];
        strength = Math.min(Math.abs(value) / (Math.abs(vals[vals.length - 1]) || 1) * 10, 1);
        signal = value > 0 ? "BUY" : "SELL";
      }
      break;
    }
    case "vwap": {
      const vals = vwap(data);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        strength = Math.abs(lastPrice - value) / value * 100;
        signal = lastPrice > value ? "BUY" : "SELL";
      }
      break;
    }
    case "mfi": {
      const tp = data.map((d) => (d.high + d.low + d.close) / 3);
      const vals = rsi2(tp, agent.params.period);
      if (vals.length > 0) {
        value = vals[vals.length - 1];
        strength = Math.abs(value - 50) / 50;
        if (value < 20) signal = "BUY";
        else if (value > 80) signal = "SELL";
      }
      break;
    }
    default:
      break;
  }
  return { agentId: agent.id, agentName: agent.name, category: agent.category, signal, strength: Math.min(strength, 1), value };
}
function runSwarmConsensus(data, agents) {
  const agentList = agents ?? SWARM_AGENTS;
  const votes = agentList.map((agent) => executeAgent(agent, data));
  let weightedBuyScore = 0;
  let weightedSellScore = 0;
  let weightedNeutralScore = 0;
  let totalWeight = 0;
  for (const vote of votes) {
    const agent = agentList.find((a) => a.id === vote.agentId);
    const weight = agent?.weight ?? 1;
    totalWeight += weight;
    const weightedStrength = vote.strength * weight;
    switch (vote.signal) {
      case "BUY":
        weightedBuyScore += weightedStrength;
        break;
      case "SELL":
        weightedSellScore += weightedStrength;
        break;
      case "NEUTRAL":
        weightedNeutralScore += weight;
        break;
    }
  }
  const buyPct = totalWeight > 0 ? weightedBuyScore / (weightedBuyScore + weightedSellScore + weightedNeutralScore) * 100 : 0;
  const sellPct = totalWeight > 0 ? weightedSellScore / (weightedBuyScore + weightedSellScore + weightedNeutralScore) * 100 : 0;
  const neutralPct = 100 - buyPct - sellPct;
  let finalSignal = "NEUTRAL";
  let confidence = 0;
  if (buyPct > sellPct + 15) {
    finalSignal = "STRONG_BUY";
    confidence = buyPct - sellPct;
  } else if (buyPct > sellPct + 5) {
    finalSignal = "BUY";
    confidence = buyPct - sellPct;
  } else if (sellPct > buyPct + 15) {
    finalSignal = "STRONG_SELL";
    confidence = sellPct - buyPct;
  } else if (sellPct > buyPct + 5) {
    finalSignal = "SELL";
    confidence = sellPct - buyPct;
  }
  const categoryBreakdown = {};
  for (const vote of votes) {
    if (!categoryBreakdown[vote.category]) categoryBreakdown[vote.category] = { buy: 0, sell: 0, neutral: 0, avgStrength: 0 };
    const cat = categoryBreakdown[vote.category];
    if (vote.signal === "BUY") cat.buy++;
    else if (vote.signal === "SELL") cat.sell++;
    else cat.neutral++;
  }
  for (const [cat, breakdown] of Object.entries(categoryBreakdown)) {
    const catVotes = votes.filter((v) => v.category === cat);
    breakdown.avgStrength = catVotes.length > 0 ? catVotes.reduce((s, v) => s + v.strength, 0) / catVotes.length : 0;
  }
  const topIndicators = [...votes].sort((a, b) => b.strength - a.strength).slice(0, 10).map((v) => ({ agentId: v.agentId, signal: v.signal, strength: v.strength }));
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    finalSignal,
    confidence: Math.round(confidence * 10) / 10,
    buyPct: Math.round(buyPct * 10) / 10,
    sellPct: Math.round(sellPct * 10) / 10,
    neutralPct: Math.round(neutralPct * 10) / 10,
    totalAgents: agentList.length,
    participatingAgents: votes.filter((v) => v.signal !== "NEUTRAL").length,
    votes,
    categoryBreakdown,
    topIndicators
  };
}
function listSwarmAgents() {
  return SWARM_AGENTS;
}

// server/_core/performanceTools.ts
var LRUCache = class {
  cache = /* @__PURE__ */ new Map();
  maxSize;
  constructor(maxSize = 1e3) {
    this.maxSize = maxSize;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return void 0;
    if (entry.expires !== null && Date.now() > entry.expires) {
      this.cache.delete(key);
      return void 0;
    }
    entry.accessTime = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }
  set(key, value, ttlMs) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { key, value, expires: ttlMs ? Date.now() + ttlMs : null, accessTime: Date.now() });
  }
  has(key) {
    return this.get(key) !== void 0;
  }
  delete(key) {
    return this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
  }
  get size() {
    return this.cache.size;
  }
  entries() {
    return Array.from(this.cache.values(), (e) => ({ key: e.key, value: e.value }));
  }
};
var MetricsCollector = class {
  counters = /* @__PURE__ */ new Map();
  gauges = /* @__PURE__ */ new Map();
  histograms = /* @__PURE__ */ new Map();
  timings = /* @__PURE__ */ new Map();
  increment(name, value = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }
  decrement(name, value = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) - value);
  }
  gauge(name, value) {
    this.gauges.set(name, value);
  }
  histogram(name, value) {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name).push(value);
  }
  timing(name, durationMs) {
    if (!this.timings.has(name)) this.timings.set(name, []);
    this.timings.get(name).push(durationMs);
  }
  async time(name, fn) {
    const start = Date.now();
    try {
      const result = await fn();
      this.timing(name, Date.now() - start);
      return result;
    } catch (e) {
      this.timing(name, Date.now() - start);
      throw e;
    }
  }
  getCounter(name) {
    return this.counters.get(name) ?? 0;
  }
  getGauge(name) {
    return this.gauges.get(name) ?? 0;
  }
  getStats(name) {
    const data = this.timings.get(name) ?? this.histograms.get(name);
    if (!data || data.length === 0) return null;
    const sorted = [...data].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
  snapshot() {
    return { timestamp: Date.now(), counters: Object.fromEntries(this.counters) };
  }
  getAllStats() {
    const result = {};
    for (const name of [...Array.from(this.timings.keys()), ...Array.from(this.histograms.keys())]) result[name] = this.getStats(name);
    return result;
  }
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timings.clear();
  }
};
var EventBus = class {
  subscribers = /* @__PURE__ */ new Map();
  globalSubscribers = /* @__PURE__ */ new Set();
  on(event, callback) {
    if (!this.subscribers.has(event)) this.subscribers.set(event, /* @__PURE__ */ new Set());
    this.subscribers.get(event).add(callback);
    return () => this.subscribers.get(event)?.delete(callback);
  }
  onAny(callback) {
    this.globalSubscribers.add(callback);
    return () => this.globalSubscribers.delete(callback);
  }
  async emit(event, data) {
    const callbacks = this.subscribers.get(event);
    if (callbacks) for (const cb of Array.from(callbacks)) {
      try {
        await cb(data);
      } catch {
      }
    }
    for (const cb of Array.from(this.globalSubscribers)) {
      try {
        await cb({ event, data });
      } catch {
      }
    }
  }
  off(event) {
    this.subscribers.delete(event);
  }
  removeAllListeners() {
    this.subscribers.clear();
    this.globalSubscribers.clear();
  }
  listenerCount(event) {
    if (!event) return Array.from(this.subscribers.values()).reduce((s, set) => s + set.size, 0) + this.globalSubscribers.size;
    return (this.subscribers.get(event)?.size ?? 0) + this.globalSubscribers.size;
  }
};
var DEFAULT_SANDBOX_CONFIG = {
  timeoutMs: 5e3,
  maxOutputLength: 5e4,
  allowImports: false,
  allowedImports: []
};
async function executeSandboxedCode(code, config = {}) {
  const cfg = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  const startTime = Date.now();
  let output = "";
  let error = null;
  let timedOut = false;
  const blocked = [/require\s*\(/, /process\./, /child_process/, /fs\./, /net\./, /dgram\./, /eval\s*\(/, /Function\s*\(/];
  for (const pattern of blocked) {
    if (pattern.test(code)) {
      return { success: false, output: "", error: `Security violation: blocked pattern detected (${pattern.source})`, executionTime: 0, timeout: false };
    }
  }
  const importMatches = code.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
  if (importMatches && !cfg.allowImports) {
    return { success: false, output: "", error: `Imports not allowed: ${importMatches.join(", ")}`, executionTime: 0, timeout: false };
  }
  if (importMatches && cfg.allowImports && cfg.allowedImports.length > 0) {
    for (const imp of importMatches) {
      const modMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (modMatch && !cfg.allowedImports.some((allowed) => modMatch[1].startsWith(allowed))) {
        return { success: false, output: "", error: `Import not in allowlist: ${modMatch[1]}`, executionTime: 0, timeout: false };
      }
    }
  }
  const logs = [];
  const sandboxConsole = {
    log: (...args) => {
      logs.push(args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
    },
    warn: (...args) => {
      logs.push("[WARN] " + args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
    },
    error: (...args) => {
      logs.push("[ERROR] " + args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
    },
    info: (...args) => {
      logs.push(args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
    }
  };
  try {
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    const fn = new AsyncFunction("console", "setTimeout", "setInterval", `"use strict";
${code}
`);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve("timeout"), cfg.timeoutMs));
    const result = await Promise.race([fn(sandboxConsole, () => {
    }, () => {
    }), timeoutPromise]);
    if (result === "timeout") {
      timedOut = true;
      error = `Execution timed out after ${cfg.timeoutMs}ms`;
    }
    output = logs.join("\n").slice(0, cfg.maxOutputLength);
    if (result !== "timeout" && result !== void 0) {
      const str = String(result);
      if (str && str !== "undefined") output = (output ? output + "\n" : "") + str.slice(0, cfg.maxOutputLength - output.length);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return { success: !error && !timedOut, output, error, executionTime: Date.now() - startTime, timeout: timedOut };
}
var MultiLevelCache = class {
  l1;
  l2;
  l1Hits = 0;
  l2Hits = 0;
  misses = 0;
  constructor(l1Size = 100, l2Size = 1e3) {
    this.l1 = new LRUCache(l1Size);
    this.l2 = new LRUCache(l2Size);
  }
  async get(key) {
    const l1Result = this.l1.get(key);
    if (l1Result !== void 0) {
      this.l1Hits++;
      return l1Result;
    }
    const l2Result = this.l2.get(key);
    if (l2Result !== void 0) {
      this.l2Hits++;
      this.l1.set(key, l2Result);
      return l2Result;
    }
    this.misses++;
    return void 0;
  }
  async set(key, value, ttlMs) {
    this.l1.set(key, value, ttlMs);
    this.l2.set(key, value, ttlMs);
  }
  async getOrCompute(key, compute, ttlMs) {
    const cached = await this.get(key);
    if (cached !== void 0) return cached;
    const value = await compute();
    await this.set(key, value, ttlMs);
    return value;
  }
  getStats() {
    return { l1Hits: this.l1Hits, l2Hits: this.l2Hits, misses: this.misses, hitRate: this.l1Hits + this.l2Hits + this.misses > 0 ? (this.l1Hits + this.l2Hits) / (this.l1Hits + this.l2Hits + this.misses) : 0, l1Size: this.l1.size, l2Size: this.l2.size };
  }
  clear() {
    this.l1.clear();
    this.l2.clear();
    this.l1Hits = 0;
    this.l2Hits = 0;
    this.misses = 0;
  }
};
var globalMetrics = new MetricsCollector();
var globalEventBus = new EventBus();
var globalCache = new MultiLevelCache(200, 2e3);
var llmResponseCache = new LRUCache(500);

// server/_core/backendConnections.ts
function listBackendConnections() {
  return [
    { id: "cloudflare-workers", label: "Cloudflare Workers", configured: Boolean(ENV.cloudflareWorkerUrl), endpoint: ENV.cloudflareWorkerUrl || null, capabilities: ["edge backend", "scheduled jobs", "KV/R2/D1 adapters"] },
    { id: "supabase", label: "Supabase", configured: Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey), endpoint: ENV.supabaseUrl || null, capabilities: ["Postgres", "auth", "storage", "realtime"] }
  ];
}
async function probeBackendConnections() {
  const results = [];
  for (const connection of listBackendConnections()) {
    if (!connection.configured || !connection.endpoint) {
      results.push({ ...connection, healthy: null, status: null, error: null });
      continue;
    }
    try {
      const response = await fetch(connection.endpoint, { method: "GET", headers: connection.id === "supabase" ? { apikey: ENV.supabaseAnonKey } : void 0, signal: AbortSignal.timeout(4e3) });
      results.push({ ...connection, healthy: response.ok, status: response.status, error: response.ok ? null : `HTTP ${response.status}` });
    } catch (error) {
      results.push({ ...connection, healthy: false, status: null, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

// server/_core/providerGateway.ts
var providerTelemetry = /* @__PURE__ */ new Map();
var telemetryFor = (id) => {
  const current = providerTelemetry.get(id) ?? { requests: 0, successes: 0, failures: 0, tokensUsed: 0, lastUsedAt: null, lastError: null };
  providerTelemetry.set(id, current);
  return current;
};
var splitKeys = (value) => (value ?? "").split(/[\n,;]+/).map((key) => key.trim()).filter(Boolean);
var indexedKeys = (prefix) => {
  const keys = [];
  for (let index2 = 1; index2 <= 50; index2 += 1) {
    const key = process.env[`${prefix}_${index2}`];
    if (key?.trim()) keys.push(key.trim());
  }
  return keys;
};
var getKeys = (prefix) => [
  ...splitKeys(process.env[`${prefix}_API_KEYS`]),
  ...splitKeys(process.env[`${prefix}_KEYS`]),
  ...splitKeys(process.env[`${prefix}_API_KEY`]),
  ...indexedKeys(prefix)
].filter((key, index2, all) => all.indexOf(key) === index2);
var configuredOrder = () => (ENV.providerOrder || "gemini,groq,ollama-cloud,openrouter").split(",").map((item) => item.trim().toLowerCase()).filter(
  (item) => ["gemini", "groq", "ollama-cloud", "openrouter"].includes(item)
);
var providerConfigs = () => {
  const all = {
    gemini: {
      id: "gemini",
      label: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      defaultModel: ENV.geminiModel,
      keys: getKeys("GEMINI")
    },
    groq: {
      id: "groq",
      label: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: ENV.groqModel,
      keys: getKeys("GROQ")
    },
    "ollama-cloud": {
      id: "ollama-cloud",
      label: "Ollama Cloud",
      baseUrl: ENV.ollamaCloudBaseUrl,
      defaultModel: ENV.ollamaCloudModel,
      keys: getKeys("OLLAMA_CLOUD")
    },
    openrouter: {
      id: "openrouter",
      label: "OpenRouter",
      baseUrl: ENV.openrouterBaseUrl,
      defaultModel: ENV.openrouterModel,
      keys: getKeys("OPENROUTER")
    }
  };
  const order = configuredOrder();
  return [...order, ...Object.keys(all).filter((id) => !order.includes(id))].map((id) => all[id]);
};
var keyCursor = /* @__PURE__ */ new Map();
var failedUntil = /* @__PURE__ */ new Map();
var RETRYABLE_STATUS = /* @__PURE__ */ new Set([401, 403, 408, 409, 425, 429, 500, 502, 503, 504]);
var sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var nextKey = (provider) => {
  if (provider.keys.length === 0) return void 0;
  const start = keyCursor.get(provider.id) ?? 0;
  for (let offset = 0; offset < provider.keys.length; offset += 1) {
    const index2 = (start + offset) % provider.keys.length;
    const key = provider.keys[index2];
    if ((failedUntil.get(`${provider.id}:${key}`) ?? 0) <= Date.now()) {
      keyCursor.set(provider.id, (index2 + 1) % provider.keys.length);
      return key;
    }
  }
  return void 0;
};
var markKeyFailed = (provider, key) => {
  failedUntil.set(`${provider.id}:${key}`, Date.now() + 3e4);
};
var availableKeyCount = (provider) => provider.keys.filter((key) => (failedUntil.get(`${provider.id}:${key}`) ?? 0) <= Date.now()).length;
var textFromContent = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : part.text ?? "").join("\n");
  return "";
};
var normalizeMessages = (messages2) => messages2.map((message) => ({
  role: message.role === "function" ? "tool" : message.role,
  content: textFromContent(message.content)
}));
async function invokeOpenAICompatible(provider, key, params) {
  const payload = {
    model: params.model ?? provider.defaultModel,
    messages: normalizeMessages(params.messages)
  };
  if (params.tools?.length) payload.tools = params.tools;
  if (params.toolChoice ?? params.tool_choice) payload.tool_choice = params.toolChoice ?? params.tool_choice;
  if (params.maxTokens ?? params.max_tokens) payload.max_tokens = params.maxTokens ?? params.max_tokens;
  if (params.responseFormat ?? params.response_format) payload.response_format = params.responseFormat ?? params.response_format;
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw Object.assign(new Error(`${provider.label} returned ${response.status}: ${await response.text()}`), { status: response.status });
  return await response.json();
}
async function invokeGemini(provider, key, params) {
  const contents = normalizeMessages(params.messages).filter((message) => message.role !== "system");
  const system = normalizeMessages(params.messages).find((message) => message.role === "system")?.content;
  const response = await fetch(`${provider.baseUrl}/models/${params.model ?? provider.defaultModel}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...system ? { systemInstruction: { parts: [{ text: system }] } } : {},
      contents: contents.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      generationConfig: params.maxTokens || params.max_tokens ? { maxOutputTokens: params.maxTokens ?? params.max_tokens } : void 0
    })
  });
  if (!response.ok) throw Object.assign(new Error(`Gemini returned ${response.status}: ${await response.text()}`), { status: response.status });
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  return { id: crypto.randomUUID(), created: Math.floor(Date.now() / 1e3), model: params.model ?? provider.defaultModel, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] };
}
async function invokeWithProviderFailover(params) {
  const providers = providerConfigs().filter((provider) => !params.provider || provider.id === params.provider);
  const errors = [];
  for (const provider of providers) {
    if (provider.keys.length === 0) continue;
    for (let attempt = 0; attempt < provider.keys.length; attempt += 1) {
      const key = nextKey(provider);
      if (!key) break;
      try {
        const telemetry = telemetryFor(provider.id);
        telemetry.requests += 1;
        const result = provider.id === "gemini" ? await invokeGemini(provider, key, params) : await invokeOpenAICompatible(provider, key, params);
        telemetry.successes += 1;
        telemetry.lastUsedAt = Date.now();
        const usage = result.usage;
        telemetry.tokensUsed += usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
        telemetry.lastError = null;
        return { ...result, provider: provider.id, providerLabel: provider.label };
      } catch (error) {
        const status = error.status;
        const telemetry = telemetryFor(provider.id);
        telemetry.requests += 1;
        telemetry.failures += 1;
        telemetry.lastUsedAt = Date.now();
        telemetry.lastError = error instanceof Error ? error.message.slice(0, 240) : "request failed";
        errors.push(`${provider.label}: ${error instanceof Error ? error.message : "request failed"}`);
        if (status === void 0 || RETRYABLE_STATUS.has(status)) markKeyFailed(provider, key);
        if (status !== void 0 && !RETRYABLE_STATUS.has(status)) break;
        await sleep2(100 * Math.min(attempt + 1, 3));
      }
    }
  }
  throw new Error(`All configured AI providers failed. ${errors.join(" | ") || "Add provider API keys in the server environment."}`);
}
function listProviderStatus() {
  return providerConfigs().map((provider) => {
    const telemetry = telemetryFor(provider.id);
    return {
      id: provider.id,
      label: provider.label,
      configured: provider.keys.length > 0,
      keyCount: provider.keys.length,
      availableKeyCount: availableKeyCount(provider),
      defaultModel: provider.defaultModel,
      requests: telemetry.requests,
      successes: telemetry.successes,
      failures: telemetry.failures,
      tokensUsed: telemetry.tokensUsed,
      quotaRemaining: "Provider quota not exposed by API",
      lastUsedAt: telemetry.lastUsedAt ? new Date(telemetry.lastUsedAt).toISOString() : null,
      lastError: telemetry.lastError
    };
  });
}
function listConnectionStatus() {
  return [
    ["kaggle", "Kaggle", "KAGGLE"],
    ["firecrawl", "Firecrawl", "FIRECRAWL"],
    ["e2b", "E2B", "E2B"]
  ].map(([id, label, prefix]) => {
    const keys = getKeys(prefix);
    return { id, label, configured: keys.length > 0, keyCount: keys.length };
  });
}
async function requestWithConnectionFailover(id, keys, request, missingMessage) {
  if (keys.length === 0) throw new Error(missingMessage);
  const errors = [];
  const connection = { id, keys };
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const key = nextKey(connection);
    if (!key) break;
    try {
      const response = await request(key);
      if (response.ok) return await response.json();
      const body = await response.text();
      errors.push(`${id} returned ${response.status}: ${body}`);
      if (RETRYABLE_STATUS.has(response.status)) markKeyFailed(connection, key);
      else break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${id} request failed`);
      markKeyFailed(connection, key);
    }
  }
  throw new Error(`${id} integration failed after trying all configured keys. ${errors.join(" | ")}`);
}
async function firecrawlScrape(url) {
  return requestWithConnectionFailover("firecrawl", getKeys("FIRECRAWL"), (key) => fetch("https://api.firecrawl.dev/v1/scrape", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ url, formats: ["markdown"] }) }), "FIRECRAWL_API_KEYS is not configured");
}
async function e2bRunCode(code, language = "python") {
  return requestWithConnectionFailover("e2b", getKeys("E2B"), (key) => fetch("https://api.e2b.dev/code-interpreter/v1/sandboxes", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ code, language }) }), "E2B_API_KEYS is not configured");
}
async function kaggleListDatasets(search) {
  return requestWithConnectionFailover("kaggle", getKeys("KAGGLE"), (key) => fetch(`https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(search)}`, { headers: { authorization: `Bearer ${key}` } }), "KAGGLE_API_KEYS is not configured");
}

// server/_core/indicatorEngine.ts
var PERIODS = [5, 7, 9, 10, 14, 20, 30, 50, 100, 200];
var familyCatalog = [
  { key: "sma", label: "Simple Moving Average", category: "trend" },
  { key: "ema", label: "Exponential Moving Average", category: "trend" },
  { key: "wma", label: "Weighted Moving Average", category: "trend" },
  { key: "hma", label: "Hull Moving Average", category: "trend" },
  { key: "dema", label: "Double Exponential Moving Average", category: "trend" },
  { key: "tema", label: "Triple Exponential Moving Average", category: "trend" },
  { key: "roc", label: "Rate of Change", category: "momentum" },
  { key: "momentum", label: "Momentum", category: "momentum" },
  { key: "rsi", label: "Relative Strength Index", category: "momentum" },
  { key: "stoch", label: "Stochastic Position", category: "momentum" },
  { key: "williams", label: "Williams Percent R", category: "momentum" },
  { key: "cmo", label: "Chande Momentum Oscillator", category: "momentum" },
  { key: "cci", label: "Commodity Channel Index", category: "momentum" },
  { key: "trix", label: "TRIX", category: "momentum" },
  { key: "atr", label: "Average True Range", category: "volatility" },
  { key: "true_range", label: "True Range", category: "volatility" },
  { key: "stdev", label: "Rolling Standard Deviation", category: "volatility" },
  { key: "variance", label: "Rolling Variance", category: "volatility" },
  { key: "zscore", label: "Rolling Z Score", category: "volatility" },
  { key: "bb_position", label: "Bollinger Position", category: "volatility" },
  { key: "range_percent", label: "Range Percent", category: "volatility" },
  { key: "volume_sma", label: "Volume Moving Average", category: "volume" },
  { key: "volume_roc", label: "Volume Rate of Change", category: "volume" },
  { key: "obv_delta", label: "On Balance Volume Delta", category: "volume" },
  { key: "adx_strength", label: "ADX Trend Strength", category: "trend" },
  { key: "di_plus", label: "Directional Index Plus", category: "trend" },
  { key: "di_minus", label: "Directional Index Minus", category: "trend" },
  { key: "mfi", label: "Money Flow Index", category: "volume" },
  { key: "force_index", label: "Force Index", category: "volume" },
  { key: "cmf", label: "Chaikin Money Flow", category: "volume" },
  { key: "vwap_distance", label: "VWAP Distance", category: "volume" },
  { key: "donchian_position", label: "Donchian Position", category: "price" },
  { key: "keltner_position", label: "Keltner Position", category: "volatility" },
  { key: "candle_body_pct", label: "Candle Body Percentage", category: "price" },
  { key: "upper_wick_pct", label: "Upper Wick Percentage", category: "price" },
  { key: "lower_wick_pct", label: "Lower Wick Percentage", category: "price" },
  { key: "gap_pct", label: "Gap Percentage", category: "price" },
  { key: "hl2", label: "HL2 Price", category: "price" },
  { key: "ohlc4", label: "OHLC4 Price", category: "price" },
  { key: "realized_vol", label: "Realized Volatility", category: "volatility" },
  { key: "upside_vol", label: "Upside Volatility", category: "volatility" },
  { key: "downside_vol", label: "Downside Volatility", category: "volatility" },
  { key: "efficiency_ratio", label: "Kaufman Efficiency Ratio", category: "trend" },
  { key: "choppiness", label: "Choppiness Index", category: "volatility" },
  { key: "volume_zscore", label: "Volume Z Score", category: "volume" },
  { key: "pvt", label: "Price Volume Trend", category: "volume" },
  { key: "ad_line", label: "Accumulation Distribution Line", category: "volume" }
];
var INDICATOR_CATALOG = familyCatalog.flatMap((family) => PERIODS.map((period) => ({ id: `${family.key}_${period}`, label: `${family.label} (${period})`, category: family.category, period })));
var mean3 = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
var rolling = (values, period, fn) => values.map((_, index2) => index2 < period - 1 ? NaN : fn(values.slice(index2 - period + 1, index2 + 1), index2));
var sma5 = (values, period) => rolling(values, period, (window) => mean3(window));
var ema4 = (values, period) => {
  const result = [];
  const alpha = 2 / (period + 1);
  let previous = 0;
  values.forEach((value, index2) => {
    previous = index2 === 0 ? value : value * alpha + previous * (1 - alpha);
    result.push(previous);
  });
  return result;
};
var wma = (values, period) => rolling(values, period, (window) => {
  const denominator = period * (period + 1) / 2;
  return window.reduce((sum, value, index2) => sum + value * (index2 + 1), 0) / denominator;
});
var diff = (values, lag) => values.map((value, index2) => index2 < lag ? NaN : value - values[index2 - lag]);
var trueRanges = (data) => data.map((bar, index2) => index2 === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - data[index2 - 1].close), Math.abs(bar.low - data[index2 - 1].close)));
var typical = (data) => data.map((bar) => (bar.high + bar.low + bar.close) / 3);
var rollingStd = (values, period) => rolling(values, period, (window) => {
  const average = mean3(window);
  return Math.sqrt(mean3(window.map((value) => (value - average) ** 2)));
});
var rsi3 = (values, period) => values.map((_, index2) => {
  if (index2 < period) return NaN;
  let gains = 0, losses = 0;
  for (let i = index2 - period + 1; i <= index2; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
});
var stochastic3 = (data, period) => data.map((bar, index2) => {
  if (index2 < period - 1) return NaN;
  const window = data.slice(index2 - period + 1, index2 + 1);
  const high = Math.max(...window.map((item) => item.high));
  const low = Math.min(...window.map((item) => item.low));
  return high === low ? 50 : (bar.close - low) / (high - low) * 100;
});
var cci3 = (data, period) => rolling(typical(data), period, (window, index2) => {
  const average = mean3(window);
  const deviation = mean3(window.map((value) => Math.abs(value - average)));
  return deviation === 0 ? 0 : (typical(data)[index2] - average) / (0.015 * deviation);
});
var obv3 = (data) => data.map((_, index2) => index2 === 0 ? 0 : data.slice(1, index2 + 1).reduce((sum, bar, offset) => sum + (bar.close > data[offset].close ? bar.volume : bar.close < data[offset].close ? -bar.volume : 0), 0));
function calculate(family, period, data) {
  const closes2 = data.map((bar) => bar.close);
  const tr = trueRanges(data);
  if (family === "sma") return sma5(closes2, period);
  if (family === "ema") return ema4(closes2, period);
  if (family === "wma") return wma(closes2, period);
  if (family === "hma") {
    const half = wma(closes2, Math.max(2, Math.floor(period / 2)));
    const full = wma(closes2, period);
    return wma(half.map((value, index2) => 2 * value - full[index2]), Math.max(2, Math.floor(Math.sqrt(period))));
  }
  if (family === "dema") {
    const first = ema4(closes2, period);
    return first.map((value, index2) => 2 * value - ema4(first, period)[index2]);
  }
  if (family === "tema") {
    const first = ema4(closes2, period);
    const second = ema4(first, period);
    const third = ema4(second, period);
    return first.map((value, index2) => 3 * value - 3 * second[index2] + third[index2]);
  }
  if (family === "roc") return closes2.map((value, index2) => index2 < period ? NaN : (value - closes2[index2 - period]) / closes2[index2 - period] * 100);
  if (family === "momentum") return diff(closes2, period);
  if (family === "rsi") return rsi3(closes2, period);
  if (family === "stoch") return stochastic3(data, period);
  if (family === "williams") return stochastic3(data, period).map((value) => Number.isNaN(value) ? NaN : value - 100);
  if (family === "cmo") return closes2.map((_, index2) => {
    if (index2 < period) return NaN;
    const changes = diff(closes2, 1).slice(index2 - period + 1, index2 + 1).filter((value) => !Number.isNaN(value));
    const up = changes.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const down = changes.filter((value) => value < 0).reduce((sum, value) => sum - value, 0);
    return up + down === 0 ? 0 : (up - down) / (up + down) * 100;
  });
  if (family === "cci") return cci3(data, period);
  if (family === "trix") return ema4(ema4(ema4(closes2, period), period), period).map((value, index2, values) => index2 === 0 ? NaN : (value - values[index2 - 1]) / values[index2 - 1] * 100);
  if (family === "atr") return rolling(tr, period, (window) => mean3(window));
  if (family === "true_range") return tr;
  if (family === "stdev") return rollingStd(closes2, period);
  if (family === "variance") return rollingStd(closes2, period).map((value) => value ** 2);
  if (family === "zscore") return rolling(closes2, period, (window, index2) => {
    const average = mean3(window);
    const sd = Math.sqrt(mean3(window.map((value) => (value - average) ** 2)));
    return sd === 0 ? 0 : (closes2[index2] - average) / sd;
  });
  if (family === "bb_position") return rolling(closes2, period, (window, index2) => {
    const average = mean3(window), sd = Math.sqrt(mean3(window.map((value) => (value - average) ** 2)));
    return sd === 0 ? 0.5 : (closes2[index2] - (average - 2 * sd)) / (4 * sd);
  });
  if (family === "range_percent") return data.map((bar) => bar.close === 0 ? 0 : (bar.high - bar.low) / bar.close * 100);
  if (family === "volume_sma") return sma5(data.map((bar) => bar.volume), period);
  if (family === "volume_roc") {
    const volumes = data.map((bar) => bar.volume);
    return volumes.map((value, index2) => index2 < period ? NaN : volumes[index2 - period] === 0 ? 0 : (value - volumes[index2 - period]) / volumes[index2 - period] * 100);
  }
  if (family === "obv_delta") return diff(obv3(data), period);
  if (family === "adx_strength" || family === "di_plus" || family === "di_minus") {
    const plus = [], minus = [], ranges = trueRanges(data);
    for (let index2 = 1; index2 < data.length; index2 += 1) {
      const up = data[index2].high - data[index2 - 1].high, down = data[index2 - 1].low - data[index2].low;
      plus.push(up > down && up > 0 ? up : 0);
      minus.push(down > up && down > 0 ? down : 0);
    }
    const atrValues = rolling(ranges, period, (window) => mean3(window));
    const plusDI = plus.map((value, index2) => atrValues[index2 + 1] ? 100 * value / atrValues[index2 + 1] : NaN);
    const minusDI = minus.map((value, index2) => atrValues[index2 + 1] ? 100 * value / atrValues[index2 + 1] : NaN);
    return family === "di_plus" ? [NaN, ...plusDI] : family === "di_minus" ? [NaN, ...minusDI] : [NaN, ...plusDI.map((value, index2) => {
      const total = value + minusDI[index2];
      return total ? 100 * Math.abs(value - minusDI[index2]) / total : 0;
    })];
  }
  if (family === "mfi") return data.map((_, index2) => {
    if (index2 < period) return NaN;
    const flows = data.slice(index2 - period + 1, index2 + 1).map((bar) => (bar.high + bar.low + bar.close) / 3 * bar.volume);
    const positive = flows.filter((_2, offset) => data[index2 - period + 1 + offset].close >= (data[index2 - period + offset]?.close ?? data[index2 - period + 1 + offset].close)).reduce((sum, value) => sum + value, 0);
    const negative = Math.max(0, flows.reduce((sum, value) => sum + value, 0) - positive);
    return negative ? 100 - 100 / (1 + positive / negative) : 100;
  });
  if (family === "force_index") return data.map((bar, index2) => index2 === 0 ? 0 : (bar.close - data[index2 - 1].close) * bar.volume);
  if (family === "cmf") return data.map((_, index2) => {
    if (index2 < period - 1) return NaN;
    const window = data.slice(index2 - period + 1, index2 + 1);
    const volume = window.reduce((sum, bar) => sum + bar.volume, 0);
    return volume ? window.reduce((sum, bar) => sum + (bar.close - bar.low - (bar.high - bar.close)) / Math.max(1e-9, bar.high - bar.low) * bar.volume, 0) / volume : 0;
  });
  if (family === "vwap_distance") return data.map((_, index2) => {
    const window = data.slice(Math.max(0, index2 - period + 1), index2 + 1);
    const volume = window.reduce((sum, bar) => sum + bar.volume, 0);
    const vwap2 = volume ? window.reduce((sum, bar) => sum + (bar.high + bar.low + bar.close) / 3 * bar.volume, 0) / volume : data[index2].close;
    return vwap2 ? (data[index2].close - vwap2) / vwap2 * 100 : 0;
  });
  if (family === "donchian_position") return data.map((bar, index2) => {
    if (index2 < period - 1) return NaN;
    const window = data.slice(index2 - period + 1, index2 + 1), high = Math.max(...window.map((item) => item.high)), low = Math.min(...window.map((item) => item.low));
    return high === low ? 0.5 : (bar.close - low) / (high - low);
  });
  if (family === "keltner_position") return data.map((bar, index2) => {
    const center = ema4(closes2, period)[index2], width = (rolling(tr, period, (window) => mean3(window))[index2] ?? 0) * 2;
    return width ? (bar.close - (center - width)) / (2 * width) : 0.5;
  });
  if (family === "candle_body_pct") return data.map((bar) => bar.high === bar.low ? 0 : Math.abs(bar.close - bar.open) / (bar.high - bar.low));
  if (family === "upper_wick_pct") return data.map((bar) => bar.high === bar.low ? 0 : (bar.high - Math.max(bar.open, bar.close)) / (bar.high - bar.low));
  if (family === "lower_wick_pct") return data.map((bar) => bar.high === bar.low ? 0 : (Math.min(bar.open, bar.close) - bar.low) / (bar.high - bar.low));
  if (family === "gap_pct") return data.map((bar, index2) => index2 === 0 || data[index2 - 1].close === 0 ? 0 : (bar.open - data[index2 - 1].close) / data[index2 - 1].close * 100);
  if (family === "hl2") return data.map((bar) => (bar.high + bar.low) / 2);
  if (family === "ohlc4") return data.map((bar) => (bar.open + bar.high + bar.low + bar.close) / 4);
  if (family === "realized_vol") return rolling(closes2.map((value, index2) => index2 === 0 ? 0 : Math.log(value / closes2[index2 - 1])), period, (window) => Math.sqrt(mean3(window.map((value) => value ** 2))) * Math.sqrt(252));
  if (family === "upside_vol" || family === "downside_vol") return rolling(closes2.map((value, index2) => index2 === 0 ? 0 : Math.log(value / closes2[index2 - 1])), period, (window) => Math.sqrt(mean3(window.filter((value) => family === "upside_vol" ? value > 0 : value < 0).map((value) => value ** 2))) * Math.sqrt(252));
  if (family === "efficiency_ratio") return closes2.map((value, index2) => {
    if (index2 < period) return NaN;
    const direction = Math.abs(value - closes2[index2 - period]), noise = closes2.slice(index2 - period + 1, index2 + 1).reduce((sum, close, offset) => sum + Math.abs(close - closes2[index2 - period + offset]), 0);
    return noise ? direction / noise : 0;
  });
  if (family === "choppiness") return data.map((_, index2) => {
    if (index2 < period - 1) return NaN;
    const range = data.slice(index2 - period + 1, index2 + 1), high = Math.max(...range.map((bar) => bar.high)), low = Math.min(...range.map((bar) => bar.low)), atrSum = range.reduce((sum, bar) => sum + bar.high - bar.low, 0);
    return high === low ? 0 : 100 * Math.log10(atrSum / (high - low)) / Math.log10(period);
  });
  if (family === "volume_zscore") return rolling(data.map((bar) => bar.volume), period, (window, index2) => {
    const average = mean3(window), sd = Math.sqrt(mean3(window.map((value) => (value - average) ** 2)));
    return sd ? (data[index2].volume - average) / sd : 0;
  });
  if (family === "pvt") return data.map((_, index2) => index2 === 0 ? 0 : index2 === 1 ? 0 : data.slice(1, index2 + 1).reduce((sum, bar, offset) => sum + (bar.close - data[offset].close) / Math.max(1e-9, data[offset].close) * bar.volume, 0));
  if (family === "ad_line") return data.map((_, index2) => data.slice(0, index2 + 1).reduce((sum, bar) => sum + (bar.close - bar.low - (bar.high - bar.close)) / Math.max(1e-9, bar.high - bar.low) * bar.volume, 0));
  throw new Error(`Unknown indicator family: ${family}`);
}
function computeIndicator(id, data) {
  const definition = INDICATOR_CATALOG.find((indicator) => indicator.id === id);
  if (!definition) throw new Error(`Unknown indicator '${id}'. Use listIndicators to inspect the catalog.`);
  if (data.length < Math.min(definition.period, 5)) throw new Error(`Indicator '${id}' requires more candle data.`);
  return { ...definition, values: calculate(id.slice(0, id.lastIndexOf("_")), definition.period, data) };
}
function computeIndicators(ids, data) {
  return ids.map((id) => computeIndicator(id, data));
}
function listIndicators(category) {
  return category ? INDICATOR_CATALOG.filter((indicator) => indicator.category === category) : INDICATOR_CATALOG;
}
function indicatorSnapshot(data, ids = ["sma_20", "ema_20", "rsi_14", "atr_14", "bb_position_20", "zscore_20"]) {
  return computeIndicators(ids, data).map((indicator) => ({ id: indicator.id, category: indicator.category, latest: indicator.values.at(-1) ?? null, values: indicator.values }));
}

// server/_core/brainSystem.ts
var memories = /* @__PURE__ */ new Map();
var tokenize = (text2) => new Set(text2.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
var similarity = (a, b) => {
  const left = tokenize(a), right = tokenize(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.sqrt(left.size * right.size);
};
function storeMemory(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const memory = { ...input, id: crypto.randomUUID(), createdAt: now, lastAccessedAt: now };
  const current = memories.get(input.userId) ?? [];
  memories.set(input.userId, [...current, memory].slice(-500));
  return memory;
}
function recallMemories(userId, query, limit = 8) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return (memories.get(userId) ?? []).map((memory) => ({ memory, score: similarity(query, `${memory.text} ${memory.tags.join(" ")}`) + memory.importance * 0.05 })).sort((a, b) => b.score - a.score).slice(0, limit).map(({ memory, score }) => {
    memory.lastAccessedAt = now;
    return { ...memory, score };
  });
}
function listMemories(userId) {
  return memories.get(userId) ?? [];
}
function forgetMemory(userId, id) {
  const remaining = (memories.get(userId) ?? []).filter((memory) => memory.id !== id);
  memories.set(userId, remaining);
  return { deleted: remaining.length < (memories.get(userId) ?? []).length };
}
var activate = (value, activation = "linear") => activation === "relu" ? Math.max(0, value) : activation === "tanh" ? Math.tanh(value) : activation === "sigmoid" ? 1 / (1 + Math.exp(-value)) : value;
function neuralForward(input, layers) {
  let values = [...input];
  for (const layer of layers) {
    if (layer.weights.length !== layer.bias.length) throw new Error("Layer weights and bias dimensions do not match");
    values = layer.weights.map((row, index2) => activate(row.reduce((sum, weight, weightIndex) => sum + weight * (values[weightIndex] ?? 0), 0) + layer.bias[index2], layer.activation));
  }
  return values;
}
function neuralFeatureVector(values) {
  const safe = values.filter(Number.isFinite);
  const average = safe.length ? safe.reduce((sum, value) => sum + value, 0) / safe.length : 0;
  const variance = safe.length ? safe.reduce((sum, value) => sum + (value - average) ** 2, 0) / safe.length : 0;
  return [average, Math.sqrt(variance), safe.at(-1) ?? 0, safe.at(-2) ?? 0, safe.length];
}
function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return exps.map((value) => value / total);
}
function conv1d(values, kernel, bias = 0, activation = "linear") {
  if (!kernel.length) throw new Error("Kernel must not be empty");
  return values.map((_, index2) => {
    if (index2 + kernel.length > values.length) return NaN;
    const value = kernel.reduce((sum, weight, offset) => sum + weight * values[index2 + offset], bias);
    return activate(value, activation);
  }).filter(Number.isFinite);
}
function recurrentSequenceForward(sequence, layers, carry) {
  let state = carry ?? [];
  const outputs = sequence.map((input) => {
    state = neuralForward([...input, ...state], layers);
    return [...state];
  });
  return { outputs, finalState: state };
}
function ensembleForward(input, models) {
  const predictions = models.map((model) => neuralForward(input, model));
  const width = Math.max(0, ...predictions.map((prediction) => prediction.length));
  const meanPrediction = Array.from({ length: width }, (_, index2) => predictions.reduce((sum, prediction) => sum + (prediction[index2] ?? 0), 0) / Math.max(1, predictions.length));
  return { predictions, mean: meanPrediction, probabilities: softmax(meanPrediction) };
}
async function runAgentSwarm(input) {
  const uniqueRoles = [...new Set(input.roles)];
  const results = await Promise.all(uniqueRoles.map((role) => runAgent(role, [{ role: "user", content: input.prompt }], { model: input.model, maxSteps: input.maxSteps ?? 3 })));
  return { members: results.map((result) => ({ agentId: result.agentId, agentName: result.agentName, finalResponse: result.finalResponse, stepsUsed: result.stepsUsed })), synthesisPrompt: results.map((result) => `${result.agentName}:
${result.finalResponse}`).join("\n\n"), consensusCount: results.length };
}

// server/_core/persistentMemory.ts
import { and as and2, desc as desc2, eq as eq2, gt as gt2, isNull as isNull2, lt as lt2, or } from "drizzle-orm";
var DIMENSIONS = 128;
var retentionDefaults = { preference: 730, fact: 365, goal: 180, conversation: 90, "tool-result": 30 };
function hashToken(token) {
  let hash = 2166136261;
  for (const character of token) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % DIMENSIONS;
}
function createEmbedding(text2, dimensions = DIMENSIONS) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text2.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
  for (const token of tokens) {
    vector[hashToken(token) % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}
function cosine(a, b) {
  let dot = 0, aMag = 0, bMag = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] ** 2;
    bMag += b[i] ** 2;
  }
  return aMag && bMag ? dot / Math.sqrt(aMag * bMag) : 0;
}
function expiryDate(days) {
  const expiry = /* @__PURE__ */ new Date();
  expiry.setTime(expiry.getTime() + Math.max(1, days) * 864e5);
  return expiry;
}
async function storePersistentMemory(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const retentionDays = input.retentionDays ?? retentionDefaults[input.kind];
  const embedding = createEmbedding(`${input.content} ${(input.tags ?? []).join(" ")}`);
  const memoryKey = `u${input.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const values = { userId: input.userId, memoryKey, kind: input.kind, content: input.content, tags: JSON.stringify(input.tags ?? []), embedding: JSON.stringify(embedding), embeddingModel: "nova-hash-v1", embeddingDimensions: embedding.length, importance: Math.round(Math.max(0, Math.min(1, input.importance ?? 0.5)) * 100), retentionDays, expiresAt: expiryDate(retentionDays) };
  const result = await db.insert(memoryEmbeddings).values(values);
  const rows = await db.select().from(memoryEmbeddings).where(eq2(memoryEmbeddings.id, Number(result[0].insertId))).limit(1);
  return rows[0];
}
async function recallPersistentMemories(userId, query, limit = 8) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await purgeExpiredMemories(userId);
  const rows = await db.select().from(memoryEmbeddings).where(and2(eq2(memoryEmbeddings.userId, userId), isNull2(memoryEmbeddings.deletedAt), or(isNull2(memoryEmbeddings.expiresAt), gt2(memoryEmbeddings.expiresAt, /* @__PURE__ */ new Date())))).orderBy(desc2(memoryEmbeddings.updatedAt)).limit(500);
  const queryVector = createEmbedding(query);
  const ranked = rows.map((row) => {
    let embedding = [];
    try {
      embedding = JSON.parse(row.embedding);
    } catch {
    }
    return { ...row, score: cosine(queryVector, embedding) + row.importance / 1e3 };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
  const now = /* @__PURE__ */ new Date();
  await Promise.all(ranked.map((row) => db.update(memoryEmbeddings).set({ lastAccessedAt: now }).where(eq2(memoryEmbeddings.id, row.id))));
  return ranked;
}
async function listPersistentMemories(userId, limit = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await purgeExpiredMemories(userId);
  return db.select().from(memoryEmbeddings).where(and2(eq2(memoryEmbeddings.userId, userId), isNull2(memoryEmbeddings.deletedAt))).orderBy(desc2(memoryEmbeddings.updatedAt)).limit(limit);
}
async function forgetPersistentMemory(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(memoryEmbeddings).set({ deletedAt: /* @__PURE__ */ new Date() }).where(and2(eq2(memoryEmbeddings.id, id), eq2(memoryEmbeddings.userId, userId)));
  return { deleted: true, id };
}
async function purgeExpiredMemories(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const conditions = [isNull2(memoryEmbeddings.deletedAt), lt2(memoryEmbeddings.expiresAt, /* @__PURE__ */ new Date())];
  if (userId !== void 0) conditions.push(eq2(memoryEmbeddings.userId, userId));
  await db.update(memoryEmbeddings).set({ deletedAt: /* @__PURE__ */ new Date() }).where(and2(...conditions));
  return { purged: true, userId: userId ?? null };
}
function retentionPolicy() {
  return { defaults: retentionDefaults, embeddingModel: "nova-hash-v1", dimensions: DIMENSIONS, behavior: "Memories expire by kind-specific retention period, are soft-deleted on expiry, and can be manually forgotten." };
}

// server/_core/musicAdvanced.ts
var clamp4 = (value, min, max) => Math.max(min, Math.min(max, value));
function voiceChord(event, options = {}) {
  const octave = options.octave ?? 4, spread = options.spread ?? 4, inversion = options.inversion ?? 0;
  const notes = getChordNotes(event.root, event.type).map((note) => noteToMidi(`${note}${octave}`));
  const rotated = notes.map((_, index2) => notes[(index2 + inversion) % notes.length] + (index2 < inversion ? 12 : 0)).sort((a, b) => a - b);
  const midi = rotated.map((note, index2) => note + Math.floor(index2 * spread / Math.max(1, rotated.length - 1)) * 12);
  return { ...event, notes: midi.map(midiToNote), midi, inversion, octave };
}
function voiceLeadProgression(progression, options = {}) {
  const voices = [];
  progression.forEach((event, index2) => {
    const candidate = voiceChord(event, { octave: options.octave ?? 4, inversion: index2 % 3 });
    if (index2 === 0) {
      voices.push(candidate);
      return;
    }
    const previous = voices[index2 - 1].midi;
    const midi = candidate.midi.map((note, voice) => {
      const target = previous[voice] ?? note;
      const alternatives = [note - 12, note, note + 12];
      return alternatives.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    });
    voices.push({ ...candidate, midi, notes: midi.map(midiToNote) });
  });
  const totalMovement = voices.slice(1).reduce((sum, voice, index2) => sum + voice.midi.reduce((inner, note, voiceIndex) => inner + Math.abs(note - (voices[index2].midi[voiceIndex] ?? note)), 0), 0);
  return { voices, totalMovement };
}
function generateArpeggio(notes, pattern = "up", steps = 16, subdivision = "1/16") {
  const sorted = [...notes].sort((a, b) => a - b);
  const sequence = pattern === "down" ? [...sorted].reverse() : pattern === "updown" ? [...sorted, ...sorted.slice(1, -1).reverse()] : sorted;
  const output = [];
  for (let index2 = 0; index2 < steps; index2 += 1) output.push(sequence[index2 % sequence.length] + Math.floor(index2 / sequence.length) * 12);
  return { pattern, subdivision, steps, midi: output, notes: output.map(midiToNote) };
}
function reharmonize(progression, mode = "diatonic") {
  if (mode === "diatonic") return progression;
  if (mode === "secondary-dominants") return progression.map((event, index2) => index2 % 2 ? { ...event, type: event.type.includes("7") ? event.type : "7" } : event);
  return progression.map((event, index2) => index2 % 2 ? { ...event, type: event.type.includes("m") ? event.type : "m" } : event);
}
function generateGroove(input = {}) {
  const steps = input.steps ?? 16, swing = clamp4(input.swing ?? 0.08, 0, 0.5), accentEvery = Math.max(1, input.accentEvery ?? 4);
  return Array.from({ length: steps }, (_, index2) => ({ step: index2, beat: index2 / 4 + (index2 % 2 ? swing : 0), velocity: index2 % accentEvery === 0 ? input.velocityMax ?? 115 : input.velocityMin ?? 75, gate: index2 % 4 === 3 ? 0.75 : 0.95 }));
}
function generateMidiAutomation(input) {
  const bars = input.bars ?? 8, resolution = input.resolution ?? 16, points = bars * resolution, curve = input.curve ?? "linear";
  const values = Array.from({ length: points }, (_, index2) => {
    const t2 = points <= 1 ? 1 : index2 / (points - 1);
    const shaped = curve === "ease-in" ? t2 ** 2 : curve === "ease-out" ? 1 - (1 - t2) ** 2 : curve === "sine" ? (1 - Math.cos(t2 * Math.PI)) / 2 : t2;
    return { bar: index2 / resolution, value: input.start + (input.end - input.start) * shaped };
  });
  return { destination: input.destination, bars, resolution, values };
}

// server/_core/technicalAdvanced.ts
function avg2(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function highest(values) {
  return values.length ? Math.max(...values) : 0;
}
function lowest(values) {
  return values.length ? Math.min(...values) : 0;
}
function clamp5(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function pivotPoints2(candle) {
  const p = (candle.high + candle.low + candle.close) / 3;
  return { pivot: p, r1: 2 * p - candle.low, r2: p + candle.high - candle.low, r3: candle.high + 2 * (p - candle.low), s1: 2 * p - candle.high, s2: p - candle.high + candle.low, s3: candle.low - 2 * (candle.high - p) };
}
function fibonacciLevels(candles, lookback = 50) {
  const sample = candles.slice(-lookback);
  if (!sample.length) throw new Error("At least one candle is required");
  const high = highest(sample.map((c) => c.high));
  const low = lowest(sample.map((c) => c.low));
  const range = high - low;
  const direction = sample.at(-1).close >= sample[0].close ? "up" : "down";
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
  return { high, low, direction, levels: ratios.map((ratio) => ({ ratio, price: direction === "up" ? high - range * ratio : low + range * ratio })) };
}
function ichimoku(candles, conversionPeriod = 9, basePeriod = 26, spanPeriod = 52, displacement = 26) {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const midpoint = (period, end2) => {
    const h = highest(highs.slice(Math.max(0, end2 - period + 1), end2 + 1));
    const l = lowest(lows.slice(Math.max(0, end2 - period + 1), end2 + 1));
    return (h + l) / 2;
  };
  const end = candles.length - 1;
  const conversion = midpoint(conversionPeriod, end);
  const base = midpoint(basePeriod, end);
  const spanB = midpoint(spanPeriod, end);
  return { conversion, base, spanA: (conversion + base) / 2, spanB, displacement, close: candles[end]?.close ?? 0, cloudBias: (candles[end]?.close ?? 0) > Math.max((conversion + base) / 2, spanB) ? "bullish" : (candles[end]?.close ?? 0) < Math.min((conversion + base) / 2, spanB) ? "bearish" : "inside-cloud" };
}
function supertrend(candles, period = 10, multiplier = 3) {
  if (candles.length < period + 1) throw new Error(`At least ${period + 1} candles are required`);
  const trs = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  const atr4 = avg2(trs.slice(-period));
  const last = candles.at(-1);
  const mid = (last.high + last.low) / 2;
  const upper = mid + multiplier * atr4;
  const lower = mid - multiplier * atr4;
  const trend = last.close >= mid ? "up" : "down";
  return { atr: atr4, upperBand: upper, lowerBand: lower, trend, distanceToBand: trend === "up" ? last.close - lower : upper - last.close };
}
function volumeProfile(candles, bins = 12) {
  const sample = candles.slice(-Math.max(1, Math.min(500, candles.length)));
  if (!sample.length) return { bins: [], pointOfControl: null, valueArea: null };
  const min = lowest(sample.map((c) => c.low));
  const max = highest(sample.map((c) => c.high));
  const width = (max - min) / bins || 1;
  const buckets = Array.from({ length: bins }, (_, i) => ({ index: i, low: min + i * width, high: i === bins - 1 ? max : min + (i + 1) * width, volume: 0 }));
  for (const candle of sample) {
    const index2 = clamp5(Math.floor((candle.close - min) / width), 0, bins - 1);
    buckets[index2].volume += candle.volume;
  }
  const total = buckets.reduce((s, b) => s + b.volume, 0);
  const poc = buckets.reduce((a, b) => b.volume > a.volume ? b : a, buckets[0]);
  const ranked = [...buckets].sort((a, b) => b.volume - a.volume);
  let covered = 0;
  const value = ranked.filter((b) => {
    if (covered / Math.max(total, 1) >= 0.7) return false;
    covered += b.volume;
    return true;
  });
  return { bins: buckets, pointOfControl: poc, valueArea: { low: lowest(value.map((b) => b.low)), high: highest(value.map((b) => b.high)), coverage: covered / Math.max(total, 1) } };
}
function rsiDivergence(candles, period = 14, window = 30) {
  const sample = candles.slice(-window);
  if (sample.length < period + 4) throw new Error("More candles are required for divergence analysis");
  const changes = sample.slice(1).map((c, i) => c.close - sample[i].close);
  const gains = changes.map((v) => Math.max(0, v));
  const losses = changes.map((v) => Math.max(0, -v));
  const rsiAt = (end) => {
    const g = avg2(gains.slice(Math.max(0, end - period), end));
    const l = avg2(losses.slice(Math.max(0, end - period), end));
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  };
  const half = Math.floor(sample.length / 2);
  const firstPrice = avg2(sample.slice(0, 3).map((c) => c.close));
  const secondPrice = avg2(sample.slice(-3).map((c) => c.close));
  const firstRsi = rsiAt(Math.max(period, half - 1));
  const secondRsi = rsiAt(changes.length - 1);
  const type = secondPrice < firstPrice && secondRsi > firstRsi ? "bullish" : secondPrice > firstPrice && secondRsi < firstRsi ? "bearish" : "none";
  return { type, firstPrice, secondPrice, firstRsi, secondRsi, confidence: type === "none" ? 0 : clamp5(Math.abs((secondRsi - firstRsi) / 50), 0, 1) };
}
function confluenceSnapshot(candles) {
  const last = candles.at(-1);
  if (!last) throw new Error("At least one candle is required");
  const fib = fibonacciLevels(candles);
  const ichi = ichimoku(candles);
  const st = supertrend(candles, Math.min(10, Math.max(2, Math.floor(candles.length / 4))), 3);
  const votes = [ichi.cloudBias === "bullish" ? 1 : ichi.cloudBias === "bearish" ? -1 : 0, st.trend === "up" ? 1 : -1, last.close >= fib.levels[4].price ? 1 : -1];
  const score = avg2(votes);
  return { score, bias: score > 0.33 ? "bullish" : score < -0.33 ? "bearish" : "neutral", components: { ichimoku: ichi, supertrend: st, fibonacci: fib } };
}

// server/_core/skillRegistry.ts
var BACKEND_SKILLS = [
  { id: "market-structure", name: "Market Structure Analysis", category: "trading", description: "Pivots, Fibonacci, Ichimoku, Supertrend, divergence, volume profile, and confluence snapshots.", tools: ["advanced_market_structure", "forex_signal_snapshot"], risk: "high", requiresAuth: true },
  { id: "research-validation", name: "Research Validation", category: "research", description: "Backtest, forward-test, walk-forward, cost modeling, and uncertainty reporting.", tools: ["research_backtest", "forward_test", "walk_forward"], risk: "high", requiresAuth: true },
  { id: "music-production", name: "Music Production", category: "music", description: "Scales, chord extensions, quantization, Euclidean rhythms, drum grids, automation, and synth patch design.", tools: ["music_scale", "music_quantize", "music_rhythm", "create_synth_patch"], risk: "low", requiresAuth: true },
  { id: "durable-memory", name: "Durable Memory", category: "memory", description: "Retention-aware persistent embeddings with scoped recall and deletion.", tools: ["persistent_remember", "persistent_recall", "purge_expired"], risk: "medium", requiresAuth: true },
  { id: "agent-swarms", name: "Agent Swarms", category: "agentic", description: "Role-scoped parallel analysis with synthesis and governance controls.", tools: ["agent_swarm", "pipeline_execute"], risk: "medium", requiresAuth: true },
  { id: "sandbox-engineering", name: "Bounded Engineering Sandbox", category: "engineering", description: "Short, import-free calculations for safe lightweight transformations.", tools: ["sandbox_execute", "sandbox_capabilities"], risk: "medium", requiresAuth: true },
  { id: "multimodal-orchestration", name: "Multimodal Orchestration", category: "agentic", description: "Coordinate text, image, audio, attachment, and artifact workflows with explicit handoffs.", tools: ["voice_transcribe", "attachment_inspect", "artifact_create", "pipeline_execute"], risk: "medium", requiresAuth: true },
  { id: "frontend-prototyping", name: "Interactive UI Prototyping", category: "engineering", description: "Design responsive interaction states, accessibility checks, theme tokens, and component behavior.", tools: ["ui_audit", "accessibility_check", "theme_preview"], risk: "low", requiresAuth: true },
  { id: "reliability-observability", name: "Reliability Observability", category: "engineering", description: "Inspect health, latency, failure modes, circuit breakers, and safe operational summaries.", tools: ["health_snapshot", "latency_summary", "tool_registry_status"], risk: "medium", requiresAuth: true },
  { id: "model-evaluation", name: "Model Evaluation", category: "research", description: "Run bounded prompt evaluations, regression comparisons, and structured quality reports.", tools: ["evaluation_run", "regression_compare", "quality_report"], risk: "medium", requiresAuth: true },
  { id: "knowledge-graph", name: "Knowledge Graph Builder", category: "memory", description: "Extract entities, relations, provenance, and scoped graph links from durable memory inputs.", tools: ["entity_extract", "relation_link", "provenance_trace"], risk: "medium", requiresAuth: true },
  { id: "crypto-collaborative-screening", name: "Crypto Collaborative Screening", category: "trading", description: "Coordinate fresh crypto OHLCV validation, technical screening, regime challenge, and cautious synthesis without execution.", tools: ["market_screening_snapshot", "technical_indicator_suite", "pipeline_execute"], risk: "high", requiresAuth: true },
  { id: "equity-collaborative-screening", name: "Equity Collaborative Screening", category: "trading", description: "Coordinate equity session validation, technical screening, data-quality challenge, and cautious synthesis without execution.", tools: ["market_screening_snapshot", "technical_indicator_suite", "pipeline_execute"], risk: "high", requiresAuth: true }
];
function listSkills(category) {
  return category ? BACKEND_SKILLS.filter((skill) => skill.category === category) : BACKEND_SKILLS;
}
function getSkill(id) {
  return BACKEND_SKILLS.find((skill) => skill.id === id);
}

// server/routers.ts
var projectInput = z2.object({
  name: z2.string().min(1).max(160),
  description: z2.string().max(2e3).optional(),
  instructions: z2.string().max(1e4).optional()
});
var readSessionToken = (req) => {
  const cookieToken = parseCookieHeader3(typeof req.headers.cookie === "string" ? req.headers.cookie : "")[COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const authorization = req.headers.authorization;
  return typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : void 0;
};
var conversationInput = z2.object({
  title: z2.string().min(1).max(240),
  projectId: z2.number().int().positive().optional(),
  model: z2.string().max(64).optional()
});
var appRouter = router({
  system: systemRouter,
  realtime: router({
    start: protectedProcedure.input(z2.object({ transport: z2.enum(["websocket", "sse"]), channel: z2.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const token = readSessionToken(ctx.req);
      if (!token) throw new Error("Active session token is required");
      const session = await getActiveUserSession(token);
      if (!session || session.userId !== ctx.user.id) throw new Error("Persistent session is not active");
      const connection = await createRealtimeConnection({ sessionId: session.id, userId: ctx.user.id, transport: input.transport, channel: input.channel });
      if (!connection) throw new Error("Database is not available");
      return { id: connection.id, sessionId: connection.sessionId, connectedAt: connection.connectedAt };
    }),
    heartbeat: protectedProcedure.input(z2.object({ connectionId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const token = readSessionToken(ctx.req);
      const session = token ? await getActiveUserSession(token) : void 0;
      if (!session || session.userId !== ctx.user.id) throw new Error("Persistent session is not active");
      await heartbeatRealtimeConnection(input.connectionId, session.id);
      return { ok: true, at: /* @__PURE__ */ new Date() };
    }),
    disconnect: protectedProcedure.input(z2.object({ connectionId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const token = readSessionToken(ctx.req);
      const session = token ? await getActiveUserSession(token) : void 0;
      if (!session || session.userId !== ctx.user.id) throw new Error("Persistent session is not active");
      await disconnectRealtimeConnection(input.connectionId, session.id);
      return { ok: true };
    }),
    active: protectedProcedure.query(({ ctx }) => listActiveRealtimeConnections(ctx.user.id))
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const token = parseCookieHeader3(ctx.req.headers.cookie ?? "")[COOKIE_NAME];
      if (token && ENV.databaseUrl) await revokeUserSession(token);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    passwordLogin: publicProcedure.input(z2.object({ password: z2.string().min(1).max(256) })).mutation(async ({ ctx, input }) => {
      const configured = ENV.passwordHash;
      if (!configured) throw new Error("Password-only access is not configured. Set NOVA_ACCESS_PASSWORD_HASH in Vercel.");
      const [salt, expectedHex] = configured.split(":");
      if (!salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex)) throw new Error("NOVA_ACCESS_PASSWORD_HASH has an invalid format.");
      const expected = Buffer.from(expectedHex, "hex");
      const actual = scryptSync(input.password, salt, expected.length || 32);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Incorrect password.");
      const openId = `password:${salt}`;
      await upsertUser({ openId, name: "Nova Workspace", email: null, loginMethod: "password" });
      const token = await sdk.createSessionToken(openId, { name: "Nova Workspace" });
      const sessionUser = await getUserByOpenId(openId);
      if (sessionUser && ENV.databaseUrl) await createUserSession({ token, userId: sessionUser.id, userAgent: ctx.req.headers["user-agent"]?.slice(0, 512) ?? null, ipHash: null, expiresAt: new Date(Date.now() + 1e3 * 60 * 60 * 24 * 365) });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1e3 * 60 * 60 * 24 * 30 });
      return { success: true };
    })
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => listProjects(ctx.user.id)),
    create: protectedProcedure.input(projectInput).mutation(
      ({ ctx, input }) => createProject({ ...input, userId: ctx.user.id })
    ),
    update: protectedProcedure.input(
      z2.object({
        id: z2.number().int().positive(),
        name: z2.string().min(1).max(160).optional(),
        description: z2.string().max(2e3).optional(),
        instructions: z2.string().max(1e4).optional()
      })
    ).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return updateProject(ctx.user.id, id, values);
    })
  }),
  web: router({
    search: protectedProcedure.input(
      z2.object({
        query: z2.string().min(2).max(500),
        depth: z2.enum(["basic", "advanced"]).default("basic")
      })
    ).mutation(async ({ input }) => {
      try {
        const response2 = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`
        );
        if (response2.ok) {
          const payload = await response2.json();
          if (payload.AbstractText) {
            return {
              heading: payload.Heading ?? input.query,
              abstractText: payload.AbstractText,
              abstractUrl: payload.AbstractURL ?? null,
              relatedTopics: (payload.RelatedTopics ?? []).filter((topic) => topic.Text).slice(0, 8).map((topic) => ({
                text: topic.Text,
                url: topic.FirstURL ?? null
              })),
              source: "duckduckgo"
            };
          }
        }
      } catch {
      }
      const response = await invokeLLM({
        model: "nova-2",
        messages: [
          {
            role: "system",
            content: "You are a search assistant. Provide a concise, factual answer to the query. If you don't know, say so. Format your response as a brief summary."
          },
          { role: "user", content: input.query }
        ]
      });
      const content = response.choices[0]?.message.content;
      const text2 = typeof content === "string" ? content : content.map((part) => part.type === "text" ? part.text : "").join("\n");
      return {
        heading: input.query,
        abstractText: text2,
        abstractUrl: null,
        relatedTopics: [],
        source: "ai-fallback"
      };
    }),
    scrape: protectedProcedure.input(z2.object({ url: z2.string().url().max(2e3) })).mutation(async ({ input }) => {
      try {
        const response = await fetch(input.url, {
          headers: { "User-Agent": "NovaChat/1.0 (compatible; Bot)" }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const text2 = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1e4);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return {
          title: titleMatch?.[1]?.trim() ?? input.url,
          text: text2,
          url: input.url
        };
      } catch (error) {
        throw new Error(
          `Failed to scrape URL: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    })
  }),
  ai: router({
    models: protectedProcedure.query(async () => (await listLLMModels()).data),
    providers: protectedProcedure.query(() => listProviderStatus()),
    providerStatus: publicProcedure.query(() => listProviderStatus()),
    runtimeConfigurationStatus: protectedProcedure.query(() => runtimeConfigurationStatus()),
    connections: protectedProcedure.query(() => listConnectionStatus()),
    backendConnections: protectedProcedure.query(() => listBackendConnections()),
    backendHealth: protectedProcedure.mutation(() => probeBackendConnections()),
    complete: protectedProcedure.input(
      z2.object({
        model: z2.string().optional(),
        provider: z2.enum(["gemini", "groq", "ollama-cloud", "openrouter"]).optional(),
        system: z2.string().optional(),
        messages: z2.array(
          z2.object({
            role: z2.enum(["user", "assistant"]),
            content: z2.string().min(1)
          })
        ).min(1)
      })
    ).mutation(async ({ input }) => {
      const response = await invokeWithProviderFailover({
        model: input.model,
        provider: input.provider,
        messages: [
          {
            role: "system",
            content: input.system ?? "You are Nova, a thoughtful and concise AI assistant. Use markdown when it improves clarity."
          },
          ...input.messages
        ]
      });
      const content = response.choices[0]?.message.content;
      return {
        model: response.model,
        provider: response.provider,
        providerLabel: response.providerLabel,
        content: typeof content === "string" ? content : content.map((part) => part.type === "text" ? part.text : "").join("\n")
      };
    }),
    createArtifact: protectedProcedure.input(
      z2.object({
        model: z2.string().optional(),
        kind: z2.enum(["document", "plan", "table", "code"]),
        prompt: z2.string().min(3).max(6e3),
        context: z2.string().max(12e3).optional()
      })
    ).mutation(async ({ input }) => {
      const kindLabel = {
        document: "a polished document",
        plan: "an actionable plan",
        table: "a clear markdown table",
        code: "a focused code artifact"
      }[input.kind];
      const response = await invokeLLM({
        model: input.model,
        messages: [
          {
            role: "system",
            content: `You create ${kindLabel} for Nova. Return only valid JSON matching the requested schema. Make the content useful, self-contained, and formatted as markdown when appropriate.`
          },
          {
            role: "user",
            content: `Create ${kindLabel} from this request:
${input.prompt}

Conversation context:
${input.context ?? "No additional context."}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "nova_artifact",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                content: { type: "string" },
                language: { type: "string" }
              },
              required: ["title", "summary", "content", "language"],
              additionalProperties: false
            }
          }
        }
      });
      const raw = response.choices[0]?.message.content;
      const parsed = JSON.parse(
        typeof raw === "string" ? raw : raw.map((part) => part.type === "text" ? part.text : "").join("")
      );
      return { ...parsed, kind: input.kind, model: response.model };
    })
  }),
  connections: router({
    scrape: protectedProcedure.input(z2.object({ url: z2.string().url().max(2e3) })).mutation(({ input }) => firecrawlScrape(input.url)),
    runCode: protectedProcedure.input(z2.object({ code: z2.string().min(1).max(5e4), language: z2.string().default("python") })).mutation(({ input }) => e2bRunCode(input.code, input.language)),
    listDatasets: protectedProcedure.input(z2.object({ search: z2.string().min(1).max(200) })).mutation(({ input }) => kaggleListDatasets(input.search))
  }),
  images: router({
    generate: protectedProcedure.input(
      z2.object({
        prompt: z2.string().min(3).max(2e3),
        model: z2.string().optional(),
        quality: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      const result = await generateImage({
        prompt: input.prompt,
        model: input.model,
        quality: input.quality
      });
      return { url: result.url };
    }),
    listModels: protectedProcedure.query(async () => {
      const result = await listImageModels();
      return result;
    })
  }),
  voice: router({
    transcribe: protectedProcedure.input(
      z2.object({
        audioUrl: z2.string().min(1),
        language: z2.string().optional(),
        prompt: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      const result = await transcribeAudio(input);
      if ("error" in result) throw new Error(result.error);
      return {
        text: result.text,
        language: result.language,
        duration: result.duration
      };
    }),
    uploadAndTranscribe: protectedProcedure.input(z2.object({ audioBase64: z2.string().min(1).max(24e6), mimeType: z2.string().min(1).max(100), language: z2.string().optional(), prompt: z2.string().optional() })).mutation(async ({ input, ctx }) => {
      const audio = Buffer.from(input.audioBase64, "base64");
      if (audio.length > 16 * 1024 * 1024) throw new Error("Audio recording exceeds the 16 MB limit.");
      const stored = await storagePut(`voice/${ctx.user.id}/${Date.now()}.audio`, audio, input.mimeType);
      const result = await transcribeAudio({ audioUrl: stored.url, language: input.language, prompt: input.prompt });
      if ("error" in result) throw new Error(result.error);
      return { text: result.text, language: result.language, duration: result.duration, audioUrl: stored.url };
    })
  }),
  conversations: router({
    list: protectedProcedure.input(
      z2.object({ projectId: z2.number().int().positive().optional() }).optional()
    ).query(
      ({ ctx, input }) => listConversations(ctx.user.id, input?.projectId)
    ),
    create: protectedProcedure.input(conversationInput).mutation(
      ({ ctx, input }) => createConversation({
        ...input,
        userId: ctx.user.id,
        model: input.model ?? "nova-2"
      })
    ),
    get: protectedProcedure.input(z2.object({ id: z2.number().int().positive() })).query(({ ctx, input }) => getConversation(ctx.user.id, input.id)),
    update: protectedProcedure.input(
      z2.object({
        id: z2.number().int().positive(),
        title: z2.string().min(1).max(240).optional(),
        model: z2.string().max(64).optional(),
        projectId: z2.number().int().positive().nullable().optional(),
        isStarred: z2.boolean().optional(),
        isArchived: z2.boolean().optional()
      })
    ).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return updateConversation(ctx.user.id, id, values);
    }),
    addMessage: protectedProcedure.input(
      z2.object({
        conversationId: z2.number().int().positive(),
        role: z2.enum(["user", "assistant"]),
        content: z2.string().min(1)
      })
    ).mutation(({ ctx, input }) => createMessage(input))
  }),
  forex: router({
    advancedIndicators: protectedProcedure.input(z2.object({ data: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(30).max(5e3), period: z2.number().int().min(2).max(100).default(14) })).mutation(({ input }) => ({ adx: adx(input.data, input.period), cci: cci(input.data), williamsR: williamsR(input.data, input.period), obv: obv(input.data), volatility: volatilityRegime(input.data, input.period), structure: marketStructure(input.data) })),
    signalSnapshot: protectedProcedure.input(z2.object({ data: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(30).max(5e3), period: z2.number().int().min(2).max(100).default(14) })).mutation(({ input }) => forexSignalSnapshot(input.data, input.period)),
    multiTimeframe: protectedProcedure.input(z2.object({ frames: z2.array(z2.object({ timeframe: z2.string().min(1).max(20), data: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(20).max(5e3) })).min(1).max(10) })).mutation(({ input }) => multiTimeframeConfluence(input.frames)),
    indicatorCatalog: protectedProcedure.input(z2.object({ category: z2.enum(["trend", "momentum", "volatility", "volume", "price"]).optional() })).query(({ input }) => listIndicators(input.category)),
    batchIndicators: protectedProcedure.input(z2.object({ ids: z2.array(z2.string()).min(1).max(240), data: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(5).max(1e4) })).mutation(({ input }) => computeIndicators(input.ids, input.data)),
    indicatorSnapshot: protectedProcedure.input(z2.object({ data: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(5).max(1e4), ids: z2.array(z2.string()).max(240).optional() })).mutation(({ input }) => indicatorSnapshot(input.data, input.ids)),
    advancedStructure: protectedProcedure.input(z2.object({ candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(20).max(5e3), lookback: z2.number().int().min(5).max(500).default(50) })).mutation(({ input }) => ({ fibonacci: fibonacciLevels(input.candles, input.lookback), ichimoku: ichimoku(input.candles), supertrend: supertrend(input.candles), divergence: rsiDivergence(input.candles), volumeProfile: volumeProfile(input.candles), confluence: confluenceSnapshot(input.candles) })),
    pivotLevels: protectedProcedure.input(z2.object({ candle: z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() }) })).query(({ input }) => pivotPoints2(input.candle)),
    analyze: protectedProcedure.input(
      z2.object({
        pair: z2.string().default("EUR/USD"),
        candles: z2.array(
          z2.object({
            timestamp: z2.number(),
            open: z2.number(),
            high: z2.number(),
            low: z2.number(),
            close: z2.number(),
            volume: z2.number()
          })
        ).min(20).max(1e3)
      })
    ).mutation(({ input }) => {
      return fullAnalysis(input.candles, input.pair);
    }),
    indicators: protectedProcedure.input(
      z2.object({
        closes: z2.array(z2.number()).min(2),
        highs: z2.array(z2.number()).optional(),
        lows: z2.array(z2.number()).optional(),
        indicator: z2.enum([
          "sma",
          "ema",
          "rsi",
          "macd",
          "bollinger",
          "stochastic",
          "atr",
          "vwap"
        ]),
        period: z2.number().int().min(2).max(200).default(14)
      })
    ).mutation(({ input }) => {
      const { closes: closes2, highs, lows, indicator, period } = input;
      switch (indicator) {
        case "sma":
          return { indicator: "SMA", values: sma(closes2, period) };
        case "ema":
          return { indicator: "EMA", values: ema(closes2, period) };
        case "rsi":
          return { indicator: "RSI", values: rsi(closes2, period) };
        case "macd":
          return { indicator: "MACD", values: macd(closes2) };
        case "bollinger":
          return {
            indicator: "Bollinger Bands",
            values: bollingerBands(closes2, period)
          };
        case "stochastic":
          return {
            indicator: "Stochastic",
            values: highs && lows ? stochastic(highs, lows, closes2, period, 3) : { k: [], d: [] }
          };
        default:
          throw new Error(`Unknown indicator: ${indicator}`);
      }
    }),
    pips: protectedProcedure.input(
      z2.object({
        entryPrice: z2.number().positive(),
        exitPrice: z2.number().positive(),
        lotSize: z2.number().positive(),
        pair: z2.string().default("EUR/USD"),
        accountCurrency: z2.string().default("USD"),
        exchangeRate: z2.number().positive().default(1)
      })
    ).mutation(({ input }) => {
      return calculatePips(
        input.entryPrice,
        input.exitPrice,
        input.lotSize,
        input.pair,
        input.accountCurrency,
        input.exchangeRate
      );
    }),
    risk: protectedProcedure.input(
      z2.object({
        accountBalance: z2.number().positive(),
        riskPercent: z2.number().min(0.1).max(10).default(2),
        entryPrice: z2.number().positive(),
        stopLossPrice: z2.number().positive(),
        takeProfitPrice: z2.number().positive(),
        pair: z2.string().default("EUR/USD")
      })
    ).mutation(({ input }) => {
      return calculateRisk(
        input.accountBalance,
        input.riskPercent,
        input.entryPrice,
        input.stopLossPrice,
        input.takeProfitPrice,
        input.pair
      );
    }),
    fibonacci: protectedProcedure.input(
      z2.object({ high: z2.number().positive(), low: z2.number().positive() })
    ).query(({ input }) => {
      return fibonacciRetracement(input.high, input.low);
    }),
    pivots: protectedProcedure.input(
      z2.object({
        high: z2.number().positive(),
        low: z2.number().positive(),
        close: z2.number().positive()
      })
    ).query(({ input }) => {
      return pivotPoints(input.high, input.low, input.close);
    }),
    sentiment: protectedProcedure.input(
      z2.object({
        closes: z2.array(z2.number()).min(30),
        highs: z2.array(z2.number()),
        lows: z2.array(z2.number())
      })
    ).mutation(({ input }) => {
      return analyzeSentiment(input.closes, input.highs, input.lows);
    }),
    correlation: protectedProcedure.input(
      z2.object({
        seriesA: z2.array(z2.number()).min(5),
        seriesB: z2.array(z2.number()).min(5)
      })
    ).query(({ input }) => {
      return { correlation: correlation(input.seriesA, input.seriesB) };
    })
  }),
  soundDesign: router({
    createPatch: protectedProcedure.input(z2.object({ name: z2.string().min(1).max(160), genre: z2.string().max(80).optional(), mood: z2.enum(["dark", "bright", "aggressive", "organic", "ambient"]).optional(), tempo: z2.number().min(20).max(300).optional(), rootNote: z2.string().max(4).optional(), wavetable: z2.string().max(120).optional() })).mutation(({ input }) => createSerumStylePatch(input)),
    analyzePatch: protectedProcedure.input(z2.object({ patch: z2.record(z2.string(), z2.unknown()) })).mutation(({ input }) => analyzeSynthPatch(input.patch)),
    modulationMatrix: protectedProcedure.input(z2.object({ patch: z2.record(z2.string(), z2.unknown()) })).mutation(({ input }) => createModulationMatrix(input.patch)),
    patchCapabilities: protectedProcedure.query(() => ({ formats: ["serum-style-json", "midi-cc-map", "nova-daw-bundle", "modulation-matrix", "macro-map"], categories: ["bass", "lead", "pad", "pluck", "fx", "drum-synth", "atmosphere"], note: "The backend returns an engine-neutral patch specification that can be adapted to Xfer Serum or another synth adapter." })),
    exportPatch: protectedProcedure.input(z2.object({ format: z2.enum(["midi-cc", "serum-style", "daw-bundle"]), patch: z2.record(z2.string(), z2.unknown()) })).mutation(({ input }) => input.format === "midi-cc" ? exportMidiCcMap(input.patch) : input.format === "serum-style" ? exportSerumStylePreset(input.patch) : exportDawBundle(input.patch))
  }),
  music: router({
    voiceChord: protectedProcedure.input(z2.object({ root: z2.string(), type: z2.string(), octave: z2.number().int().min(0).max(8).optional(), spread: z2.number().min(0).max(8).optional(), inversion: z2.number().int().min(0).max(8).optional() })).query(({ input }) => voiceChord(input)),
    voiceLead: protectedProcedure.input(z2.object({ progression: z2.array(z2.object({ root: z2.string(), type: z2.string(), duration: z2.number().optional() })).min(1).max(64), octave: z2.number().int().min(0).max(8).optional() })).query(({ input }) => voiceLeadProgression(input.progression, input)),
    arpeggio: protectedProcedure.input(z2.object({ notes: z2.array(z2.number()).min(1).max(32), pattern: z2.enum(["up", "down", "updown", "random"]).optional(), steps: z2.number().int().min(1).max(512).optional(), subdivision: z2.string().optional() })).query(({ input }) => generateArpeggio(input.notes, input.pattern, input.steps, input.subdivision)),
    reharmonize: protectedProcedure.input(z2.object({ progression: z2.array(z2.object({ root: z2.string(), type: z2.string(), duration: z2.number().optional() })).min(1).max(64), mode: z2.enum(["diatonic", "secondary-dominants", "modal-mixture"]).optional() })).query(({ input }) => reharmonize(input.progression, input.mode)),
    groove: protectedProcedure.input(z2.object({ steps: z2.number().int().min(1).max(512).optional(), swing: z2.number().min(0).max(0.5).optional(), accentEvery: z2.number().int().min(1).max(32).optional(), velocityMin: z2.number().int().min(1).max(127).optional(), velocityMax: z2.number().int().min(1).max(127).optional() })).query(({ input }) => generateGroove(input)),
    midiAutomation: protectedProcedure.input(z2.object({ destination: z2.string().min(1).max(200), start: z2.number(), end: z2.number(), bars: z2.number().int().min(1).max(256).optional(), resolution: z2.number().int().min(1).max(128).optional(), curve: z2.enum(["linear", "ease-in", "ease-out", "sine"]).optional() })).query(({ input }) => generateMidiAutomation(input)),
    scales: protectedProcedure.input(
      z2.object({
        root: z2.enum([
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B"
        ]),
        name: z2.string()
      })
    ).query(({ input }) => {
      return {
        notes: getScaleNotes(input.root, input.name),
        availableScales: Object.keys(SCALES)
      };
    }),
    chords: protectedProcedure.input(
      z2.object({
        root: z2.enum([
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B"
        ]),
        type: z2.string()
      })
    ).query(({ input }) => {
      return {
        notes: getChordNotes(input.root, input.type),
        availableTypes: Object.keys(CHORD_TYPES)
      };
    }),
    scaleChords: protectedProcedure.input(
      z2.object({
        root: z2.enum([
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B"
        ]),
        scale: z2.string()
      })
    ).query(({ input }) => {
      return getScaleChords(input.root, input.scale);
    }),
    progression: protectedProcedure.input(
      z2.object({
        root: z2.enum([
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B"
        ]),
        scale: z2.string().default("major"),
        degrees: z2.array(z2.number()).optional(),
        variations: z2.boolean().default(true)
      })
    ).mutation(({ input }) => {
      return generateChordProgression(
        input.root,
        input.scale,
        input.degrees,
        input.variations
      );
    }),
    melody: protectedProcedure.input(
      z2.object({
        root: z2.enum([
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B"
        ]),
        scale: z2.string().default("major"),
        length: z2.number().int().min(4).max(64).default(16)
      })
    ).mutation(({ input }) => {
      return generateMelody(input.root, input.scale, input.length);
    }),
    drums: protectedProcedure.input(
      z2.object({
        style: z2.enum(["rock", "jazz", "hiphop", "electronic", "latin"]).default("rock"),
        bars: z2.number().int().min(1).max(16).default(4)
      })
    ).mutation(({ input }) => {
      return generateDrumPattern(input.style, input.bars);
    }),
    song: protectedProcedure.input(
      z2.object({
        root: z2.enum([
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B"
        ]).default("C"),
        scale: z2.string().default("major"),
        style: z2.enum(["rock", "jazz", "pop", "electronic", "classical"]).default("pop"),
        sections: z2.array(z2.string()).optional()
      })
    ).mutation(({ input }) => {
      return generateSong(
        input.root,
        input.scale,
        input.style,
        input.sections
      );
    }),
    abc: protectedProcedure.input(
      z2.object({
        root: z2.enum([
          "C",
          "C#",
          "D",
          "D#",
          "E",
          "F",
          "F#",
          "G",
          "G#",
          "A",
          "A#",
          "B"
        ]),
        scale: z2.string().default("major"),
        title: z2.string().optional(),
        tempo: z2.number().default(120)
      })
    ).mutation(({ input }) => {
      const melody = generateMelody(input.root, input.scale, 32);
      return { abc: melodyToABC(melody, input.title) };
    }),
    proScale: protectedProcedure.input(z2.object({ root: z2.number().int().min(0).max(127).default(60), scale: z2.enum(["major", "minor", "dorian", "pentatonic", "blues"]).default("major"), octaves: z2.number().int().min(1).max(4).default(2) })).query(({ input }) => ({ notes: scaleNotes(input.root, input.scale, input.octaves) })),
    chordExtensions: protectedProcedure.input(z2.object({ root: z2.number().int().min(0).max(127), quality: z2.enum(["major", "minor", "dominant", "diminished"]).default("major"), extensions: z2.array(z2.number().int()).max(8).default([7, 9]) })).query(({ input }) => ({ notes: chordExtensions(input.root, input.quality, input.extensions) })),
    quantize: protectedProcedure.input(z2.object({ events: z2.array(z2.object({ note: z2.number(), start: z2.number(), duration: z2.number(), velocity: z2.number() })).max(2e4), grid: z2.number().positive().max(64).default(0.25), strength: z2.number().min(0).max(1).default(1) })).mutation(({ input }) => quantizeNotes(input.events, input.grid, input.strength)),
    euclidean: protectedProcedure.input(z2.object({ steps: z2.number().int().min(1).max(128), pulses: z2.number().int().min(0).max(128), rotation: z2.number().int().optional() })).query(({ input }) => euclideanRhythm(input.steps, input.pulses, input.rotation)),
    drumGrid: protectedProcedure.input(z2.object({ steps: z2.number().int().min(1).max(128).default(16), density: z2.number().min(0).max(1).default(0.5), seed: z2.number().int().optional() })).query(({ input }) => drumGrid(input.steps, input.density, input.seed)),
    automationShape: protectedProcedure.input(z2.object({ points: z2.array(z2.number()).min(1).max(512), curve: z2.enum(["linear", "ease-in", "ease-out", "sine"]).default("linear"), samples: z2.number().int().min(2).max(4096).default(64) })).query(({ input }) => shapeAutomation(input.points, input.curve, input.samples))
  }),
  codeTools: router({
    metrics: protectedProcedure.input(
      z2.object({
        code: z2.string().min(1).max(5e4),
        language: z2.string().default("typescript")
      })
    ).mutation(({ input }) => {
      return analyzeMetrics(input.code, input.language);
    }),
    issues: protectedProcedure.input(
      z2.object({
        code: z2.string().min(1).max(5e4),
        language: z2.string().default("typescript")
      })
    ).mutation(({ input }) => {
      return detectIssues(input.code, input.language);
    }),
    refactors: protectedProcedure.input(
      z2.object({
        code: z2.string().min(1).max(5e4),
        language: z2.string().default("typescript")
      })
    ).mutation(({ input }) => {
      return suggestRefactors(input.code, input.language);
    }),
    convert: protectedProcedure.input(
      z2.object({
        code: z2.string().min(1).max(5e4),
        from: z2.string(),
        to: z2.string()
      })
    ).mutation(({ input }) => {
      return convertCode(input.code, input.from, input.to);
    }),
    documentation: protectedProcedure.input(
      z2.object({
        code: z2.string().min(1).max(5e4),
        language: z2.string().default("typescript")
      })
    ).mutation(({ input }) => {
      return {
        documentation: generateDocumentation(input.code, input.language)
      };
    }),
    testStubs: protectedProcedure.input(
      z2.object({
        code: z2.string().min(1).max(5e4),
        language: z2.string().default("typescript")
      })
    ).mutation(({ input }) => {
      return { tests: generateTestStubs(input.code, input.language) };
    }),
    regex: protectedProcedure.input(z2.object({ input: z2.string() })).query(({ input }) => {
      return regexHelper(input.input);
    })
  }),
  toolGovernance: router({
    policies: protectedProcedure.query(() => listToolPolicies()),
    runtime: protectedProcedure.query(() => listToolRuntime()),
    resetCircuit: adminProcedure.input(z2.object({ toolName: z2.string().min(1) })).mutation(({ input }) => resetToolCircuit(input.toolName))
  }),
  backendTools: router({
    featureCatalog: protectedProcedure.input(
      z2.object({
        count: z2.number().int().min(1).max(2e4).default(100),
        offset: z2.number().int().min(0).default(0)
      })
    ).query(({ input }) => generateFeatureCatalog(input.count, input.offset)),
    advancedFeatureBundles: protectedProcedure.query(() => ({
      firstWave: generateFeatureCatalog(8e3),
      secondWave: generateFeatureCatalog(1e4, 8e3),
      total: 18e3,
      productionReadinessNote: "Generated as a deterministic, typed backend capability catalog for prioritization, roadmap planning, and implementation tracking."
    })),
    redactSensitiveText: protectedProcedure.input(z2.object({ text: z2.string().min(1).max(1e5) })).mutation(({ input }) => redactSensitiveText(input.text)),
    chunkText: protectedProcedure.input(
      z2.object({
        text: z2.string().min(1).max(5e5),
        maxChars: z2.number().int().min(100).max(8e3).default(1200),
        overlap: z2.number().int().min(0).default(120)
      })
    ).mutation(
      ({ input }) => chunkText(input.text, input.maxChars, input.overlap)
    ),
    serviceHealth: protectedProcedure.input(
      z2.object({
        latencyMs: z2.number().min(0),
        errorRate: z2.number().min(0).max(1),
        saturation: z2.number().min(0).max(1),
        queueDepth: z2.number().int().min(0).optional()
      })
    ).query(({ input }) => evaluateServiceHealth(input)),
    runbook: protectedProcedure.input(
      z2.object({
        service: z2.string().min(1).max(120),
        symptom: z2.string().min(1).max(500),
        severity: z2.enum(["low", "normal", "high", "critical"])
      })
    ).mutation(({ input }) => createRunbook(input)),
    tokenBucket: protectedProcedure.input(
      z2.object({
        capacity: z2.number().int().min(1).max(1e6),
        refillPerSecond: z2.number().positive(),
        currentTokens: z2.number().min(0),
        requestedTokens: z2.number().int().min(1).optional(),
        elapsedMs: z2.number().min(0)
      })
    ).query(({ input }) => evaluateTokenBucket(input)),
    cachePolicy: protectedProcedure.input(
      z2.object({
        resource: z2.string().min(1).max(160),
        volatility: z2.enum(["static", "daily", "hourly", "realtime"]),
        userScoped: z2.boolean().optional(),
        tags: z2.array(z2.string().min(1).max(80)).max(20).optional()
      })
    ).query(({ input }) => buildCachePolicy(input)),
    circuitBreaker: protectedProcedure.input(
      z2.object({
        successes: z2.number().int().min(0),
        failures: z2.number().int().min(0),
        minimumSamples: z2.number().int().min(1).optional(),
        failureThreshold: z2.number().min(0).max(1).optional(),
        openedAt: z2.string().datetime().optional(),
        cooldownMs: z2.number().int().min(1).optional()
      })
    ).query(({ input }) => evaluateCircuitBreaker(input)),
    workflowPlan: protectedProcedure.input(
      z2.object({
        steps: z2.array(
          z2.object({
            id: z2.string().min(1).max(120),
            dependsOn: z2.array(z2.string().min(1).max(120)).optional(),
            durationMs: z2.number().int().min(0).optional(),
            retryable: z2.boolean().optional()
          })
        ).min(1).max(500)
      })
    ).mutation(({ input }) => planWorkflowExecution(input.steps)),
    featureFlag: protectedProcedure.input(
      z2.object({
        flagKey: z2.string().min(1).max(120),
        subjectId: z2.string().min(1).max(240),
        rolloutPercent: z2.number().min(0).max(100),
        enabled: z2.boolean().optional(),
        allowList: z2.array(z2.string()).max(1e3).optional(),
        denyList: z2.array(z2.string()).max(1e3).optional()
      })
    ).query(({ input }) => evaluateFeatureFlag(input)),
    idempotencyKey: protectedProcedure.input(
      z2.object({
        method: z2.string().min(1).max(16),
        path: z2.string().min(1).max(2e3),
        body: z2.unknown(),
        tenantId: z2.string().max(120).optional()
      })
    ).mutation(({ input }) => ({ key: createIdempotencyKey(input) })),
    dataQuality: protectedProcedure.input(
      z2.object({ rows: z2.array(z2.record(z2.string(), z2.unknown())).max(5e3) })
    ).mutation(({ input }) => scoreDataQuality(input.rows)),
    auditEvent: protectedProcedure.input(
      z2.object({
        actorId: z2.string().min(1).max(120),
        action: z2.string().min(1).max(160),
        resource: z2.string().min(1).max(240),
        metadata: z2.record(z2.string(), z2.unknown()).optional()
      })
    ).mutation(({ input }) => buildAuditEvent(input)),
    capacityPlan: protectedProcedure.input(
      z2.object({
        currentRps: z2.number().min(0),
        peakMultiplier: z2.number().min(1),
        targetCpuUtilization: z2.number().min(0.01).max(1),
        rpsPerInstance: z2.number().positive(),
        minimumInstances: z2.number().int().min(1).optional()
      })
    ).query(({ input }) => planCapacity(input)),
    slo: protectedProcedure.input(
      z2.object({
        target: z2.number().min(1e-4).max(0.9999),
        goodEvents: z2.number().int().min(0),
        totalEvents: z2.number().int().min(0),
        windowDays: z2.number().int().min(1).max(366).optional()
      })
    ).query(({ input }) => evaluateSlo(input)),
    retryPolicy: protectedProcedure.input(
      z2.object({
        maxAttempts: z2.number().int().min(1).max(20),
        baseDelayMs: z2.number().int().min(1),
        maxDelayMs: z2.number().int().min(1),
        jitterRatio: z2.number().min(0).max(1).optional()
      })
    ).query(({ input }) => buildRetryPolicy(input)),
    accessPolicy: protectedProcedure.input(
      z2.object({
        subject: z2.object({
          id: z2.string().min(1),
          roles: z2.array(z2.string()).max(100),
          attributes: z2.record(
            z2.string(),
            z2.union([z2.string(), z2.number(), z2.boolean()])
          ).optional()
        }),
        action: z2.string().min(1).max(160),
        resource: z2.object({
          id: z2.string().min(1),
          ownerId: z2.string().optional(),
          requiredRoles: z2.array(z2.string()).max(100).optional(),
          attributes: z2.record(
            z2.string(),
            z2.union([z2.string(), z2.number(), z2.boolean()])
          ).optional()
        })
      })
    ).query(({ input }) => evaluateAccessPolicy(input)),
    secretScan: protectedProcedure.input(z2.object({ text: z2.string().min(1).max(2e5) })).mutation(({ input }) => scanSecrets(input.text)),
    pagination: protectedProcedure.input(
      z2.object({
        totalItems: z2.number().int().min(0),
        page: z2.number().int().min(1),
        pageSize: z2.number().int().min(1),
        maxPageSize: z2.number().int().min(1).max(5e3).optional()
      })
    ).query(({ input }) => planPagination(input)),
    apiCompatibility: protectedProcedure.input(
      z2.object({
        previous: z2.array(
          z2.object({
            path: z2.string(),
            method: z2.string(),
            responseFields: z2.array(z2.string())
          })
        ).max(1e3),
        next: z2.array(
          z2.object({
            path: z2.string(),
            method: z2.string(),
            responseFields: z2.array(z2.string())
          })
        ).max(1e3)
      })
    ).mutation(({ input }) => compareApiVersions(input)),
    usageCost: protectedProcedure.input(
      z2.object({
        unitCost: z2.number().min(0),
        currentUnits: z2.number().min(0),
        growthRate: z2.number().min(-0.99).max(10),
        months: z2.number().int().min(1).max(60)
      })
    ).query(({ input }) => forecastUsageCost(input)),
    dependencyRisk: protectedProcedure.input(
      z2.object({
        dependencies: z2.array(
          z2.object({
            name: z2.string().min(1),
            version: z2.string().min(1),
            daysSinceUpdate: z2.number().int().min(0),
            criticalVulnerabilities: z2.number().int().min(0).optional(),
            direct: z2.boolean().optional()
          })
        ).max(5e3)
      })
    ).mutation(({ input }) => analyzeDependencyRisk(input.dependencies)),
    maintenanceWindow: protectedProcedure.input(
      z2.object({
        durationMinutes: z2.number().int().min(1).max(10080),
        impactedUsers: z2.number().int().min(0),
        regions: z2.array(z2.string().min(1)).min(1).max(100),
        canaryPercent: z2.number().min(0).max(100).optional()
      })
    ).query(({ input }) => planMaintenanceWindow(input)),
    eventSummary: protectedProcedure.input(
      z2.object({
        events: z2.array(
          z2.object({
            type: z2.string().min(1),
            timestamp: z2.string().datetime(),
            severity: z2.enum(["info", "warning", "error", "critical"]).optional()
          })
        ).max(1e4)
      })
    ).mutation(({ input }) => summarizeEventStream(input.events))
  }),
  skills: router({
    list: protectedProcedure.input(z2.object({ category: z2.enum(["research", "trading", "music", "engineering", "memory", "agentic"]).optional() })).query(({ input }) => listSkills(input.category)),
    get: protectedProcedure.input(z2.object({ id: z2.string().min(1).max(100) })).query(({ input }) => getSkill(input.id) ?? null)
  }),
  agents: router({
    list: protectedProcedure.query(() => listAgents()),
    swarm: protectedProcedure.input(z2.object({ roles: z2.array(z2.enum(["forex_analyst", "code_reviewer", "music_composer", "data_analyst", "research_agent", "writing_assistant", "math_tutor", "translator", "summarizer", "brainstormer", "sound_designer", "quant_researcher", "risk_manager", "memory_architect", "ml_engineer", "music_producer", "audio_engineer", "market_microstructure", "data_engineer", "automation_orchestrator", "qa_engineer"])).min(2).max(6), prompt: z2.string().min(1).max(12e3), model: z2.string().optional(), maxSteps: z2.number().int().min(1).max(8).default(3) })).mutation(({ input }) => runAgentSwarm(input)),
    run: protectedProcedure.input(
      z2.object({
        agentId: z2.enum([
          "forex_analyst",
          "code_reviewer",
          "music_composer",
          "data_analyst",
          "research_agent",
          "writing_assistant",
          "math_tutor",
          "translator",
          "summarizer",
          "brainstormer",
          "sound_designer",
          "quant_researcher",
          "risk_manager",
          "memory_architect",
          "ml_engineer",
          "music_producer"
        ]),
        messages: z2.array(
          z2.object({
            role: z2.enum(["user", "assistant"]),
            content: z2.string()
          })
        ),
        model: z2.string().optional(),
        context: z2.string().optional(),
        maxSteps: z2.number().int().min(1).max(10).default(5)
      })
    ).mutation(async ({ input }) => {
      return runAgent(input.agentId, input.messages, {
        model: input.model,
        context: input.context,
        maxSteps: input.maxSteps
      });
    })
  }),
  pipelines: router({
    list: protectedProcedure.query(() => listPipelines()),
    get: protectedProcedure.input(z2.object({ id: z2.string() })).query(({ input }) => {
      const pipeline = getPipeline(input.id);
      if (!pipeline) throw new Error("Pipeline not found");
      return pipeline;
    }),
    run: protectedProcedure.input(
      z2.object({
        id: z2.string(),
        input: z2.string().min(1).max(1e4),
        model: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      return executePipeline(input.id, input.input, { model: input.model });
    })
  }),
  brain: router({
    memories: protectedProcedure.query(({ ctx }) => listMemories(String(ctx.user.id))),
    persistentMemories: protectedProcedure.query(({ ctx }) => listPersistentMemories(ctx.user.id)),
    persistentRecall: protectedProcedure.input(z2.object({ query: z2.string().min(1).max(2e3), limit: z2.number().int().min(1).max(25).default(8) })).query(({ ctx, input }) => recallPersistentMemories(ctx.user.id, input.query, input.limit)),
    persistentRemember: protectedProcedure.input(z2.object({ kind: z2.enum(["preference", "fact", "goal", "conversation", "tool-result"]), content: z2.string().min(1).max(1e4), tags: z2.array(z2.string()).max(30).default([]), importance: z2.number().min(0).max(1).default(0.5), retentionDays: z2.number().int().min(1).max(3650).optional() })).mutation(({ ctx, input }) => storePersistentMemory({ userId: ctx.user.id, ...input })),
    persistentForget: protectedProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(({ ctx, input }) => forgetPersistentMemory(ctx.user.id, input.id)),
    purgeExpired: adminProcedure.input(z2.object({ userId: z2.number().int().positive().optional() })).mutation(({ input }) => purgeExpiredMemories(input.userId)),
    retentionPolicy: protectedProcedure.query(() => retentionPolicy()),
    recall: protectedProcedure.input(z2.object({ query: z2.string().min(1).max(2e3), limit: z2.number().int().min(1).max(25).default(8) })).query(({ ctx, input }) => recallMemories(String(ctx.user.id), input.query, input.limit)),
    remember: protectedProcedure.input(z2.object({ kind: z2.enum(["preference", "fact", "goal", "conversation", "tool-result"]), text: z2.string().min(1).max(5e3), tags: z2.array(z2.string()).max(20).default([]), importance: z2.number().min(0).max(1).default(0.5) })).mutation(({ ctx, input }) => storeMemory({ userId: String(ctx.user.id), kind: input.kind, text: input.text, tags: input.tags, importance: input.importance })),
    forget: protectedProcedure.input(z2.object({ id: z2.string().uuid() })).mutation(({ ctx, input }) => forgetMemory(String(ctx.user.id), input.id)),
    neuralForward: protectedProcedure.input(z2.object({ input: z2.array(z2.number()).max(2048), layers: z2.array(z2.object({ weights: z2.array(z2.array(z2.number())), bias: z2.array(z2.number()), activation: z2.enum(["relu", "tanh", "sigmoid", "linear"]).optional() })).max(32) })).mutation(({ input }) => neuralForward(input.input, input.layers)),
    neuralFeatures: protectedProcedure.input(z2.object({ values: z2.array(z2.number()).max(1e4) })).mutation(({ input }) => neuralFeatureVector(input.values)),
    softmax: protectedProcedure.input(z2.object({ values: z2.array(z2.number()).min(1).max(4096) })).mutation(({ input }) => softmax(input.values)),
    convolution1d: protectedProcedure.input(z2.object({ values: z2.array(z2.number()).min(1).max(1e4), kernel: z2.array(z2.number()).min(1).max(128), bias: z2.number().optional(), activation: z2.enum(["relu", "tanh", "sigmoid", "linear"]).optional() })).mutation(({ input }) => conv1d(input.values, input.kernel, input.bias, input.activation)),
    recurrentSequence: protectedProcedure.input(z2.object({ sequence: z2.array(z2.array(z2.number())).min(1).max(512), layers: z2.array(z2.object({ weights: z2.array(z2.array(z2.number())), bias: z2.array(z2.number()), activation: z2.enum(["relu", "tanh", "sigmoid", "linear"]).optional() })).max(32), carry: z2.array(z2.number()).optional() })).mutation(({ input }) => recurrentSequenceForward(input.sequence, input.layers, input.carry)),
    ensemble: protectedProcedure.input(z2.object({ input: z2.array(z2.number()).max(2048), models: z2.array(z2.array(z2.object({ weights: z2.array(z2.array(z2.number())), bias: z2.array(z2.number()), activation: z2.enum(["relu", "tanh", "sigmoid", "linear"]).optional() }))).min(1).max(16) })).mutation(({ input }) => ensembleForward(input.input, input.models))
  }),
  trading: router({
    indicatorCatalog: protectedProcedure.input(z2.object({ category: z2.enum(["trend", "momentum", "volatility", "volume", "price"]).optional() })).query(({ input }) => listIndicators(input.category)),
    indicator: protectedProcedure.input(z2.object({ id: z2.string(), candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(5).max(1e4) })).mutation(({ input }) => computeIndicator(input.id, input.candles)),
    researchBacktest: protectedProcedure.input(z2.object({ candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(60), config: z2.record(z2.string(), z2.number()).optional() })).mutation(({ input }) => runBacktest2(input.candles, input.config)),
    forwardTest: protectedProcedure.input(z2.object({ candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(70), config: z2.record(z2.string(), z2.number()).optional() })).mutation(({ input }) => runForwardTest(input.candles, input.config)),
    walkForward: protectedProcedure.input(z2.object({ candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(100), config: z2.record(z2.string(), z2.number()).optional() })).mutation(({ input }) => walkForwardAnalysis(input.candles, input.config)),
    strategies: protectedProcedure.query(() => BUILT_IN_STRATEGIES),
    streamCatalog: protectedProcedure.query(() => listMarketStreams()),
    coinbaseSubscription: protectedProcedure.input(z2.object({ productIds: z2.array(z2.string()).min(1).max(50), channel: z2.enum(["ticker", "market_trades", "level2", "candles"]).default("ticker") })).query(({ input }) => ({ url: "wss://advanced-trade-ws.coinbase.com", payload: buildCoinbaseSubscription(input.productIds, input.channel), authRequired: false })),
    massiveSubscription: protectedProcedure.input(z2.object({ symbols: z2.array(z2.string()).min(1).max(100), channel: z2.enum(["trades", "quotes", "bars"]).default("trades") })).query(({ input }) => ({ url: ENV.massiveWsUrl || null, payload: buildMassiveSubscription(input.symbols, input.channel), configured: Boolean(ENV.massiveWsUrl && ENV.massiveApiKey), authRequired: true })),
    backtest: protectedProcedure.input(z2.object({
      candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(50),
      strategyName: z2.string().optional(),
      customStrategy: z2.object({
        name: z2.string(),
        description: z2.string(),
        timeframe: z2.string(),
        marketType: z2.string(),
        entryRules: z2.array(z2.object({ type: z2.string(), params: z2.record(z2.string(), z2.union([z2.number(), z2.string(), z2.boolean()])) })),
        exitRules: z2.object({ tpAtrMult: z2.number(), slAtrMult: z2.number(), trailingStop: z2.boolean().optional(), trailingAtrMult: z2.number().optional(), maxHoldingBars: z2.number() }),
        riskManagement: z2.object({ riskPerTrade: z2.number(), maxConcurrentPositions: z2.number(), minBarsBetweenTrades: z2.number() })
      }).optional()
    })).mutation(({ input }) => {
      const strategy = input.customStrategy ?? BUILT_IN_STRATEGIES.find((s) => s.name === input.strategyName) ?? BUILT_IN_STRATEGIES[0];
      const { trades, equityCurve, drawdownCurve, ...stats } = runBacktest(input.candles, strategy);
      return { ...stats, tradeCount: trades.length, sampleTrades: trades.slice(-10) };
    }),
    automatedBacktest: protectedProcedure.input(z2.object({
      candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(60).max(1e4),
      strategyName: z2.string().optional(),
      commissionBps: z2.number().min(0).max(500).default(0),
      slippageBps: z2.number().min(0).max(500).default(0),
      walkForwardFolds: z2.number().int().min(0).max(8).optional()
    })).mutation(({ input }) => {
      const strategy = BUILT_IN_STRATEGIES.find((s) => s.name === input.strategyName) ?? BUILT_IN_STRATEGIES[0];
      return runAutomatedBacktest(input.candles, strategy, { commissionBps: input.commissionBps, slippageBps: input.slippageBps, walkForwardFolds: input.walkForwardFolds });
    }),
    signals: protectedProcedure.input(z2.object({
      candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(30),
      strategyType: z2.enum(["rsi_bb_reversal", "macd_cross", "stochastic_cross", "ema_cross", "ichimoku_supertrend", "fibonacci_breakout", "multi_indicator_confluence"]),
      params: z2.record(z2.string(), z2.number()).optional()
    })).mutation(({ input }) => {
      switch (input.strategyType) {
        case "rsi_bb_reversal":
          return { signals: generateRSIBBSignal(input.candles, input.params) };
        case "macd_cross":
          return { signals: generateMACDCrossSignal(input.candles, input.params) };
        case "stochastic_cross":
          return { signals: generateStochasticCrossSignal(input.candles, input.params) };
        case "ema_cross":
          return { signals: generateEMACrossSignal(input.candles, input.params) };
        case "ichimoku_supertrend":
          return { signals: generateIchimokuSuperTrendSignal(input.candles, input.params) };
        case "fibonacci_breakout":
          return { signals: generateFibonacciBreakoutSignal(input.candles, input.params) };
        case "multi_indicator_confluence":
          return { signals: generateConfluenceSignal(input.candles) };
      }
    }),
    patterns: protectedProcedure.input(z2.object({
      candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(5).max(500)
    })).mutation(({ input }) => {
      const allPatterns = detectCandlePatterns(input.candles);
      const detected = allPatterns.map((patterns, i) => ({ bar: i + 1, time: input.candles[i].timestamp, patterns })).filter((p) => p.patterns.length > 0);
      return { totalBars: input.candles.length, barsWithPatterns: detected.length, patterns: detected };
    }),
    derivSymbols: protectedProcedure.query(() => DERIV_SYMBOLS),
    derivWsUrl: protectedProcedure.input(z2.object({ appId: z2.string().default("1089") })).query(({ input }) => ({ url: buildDerivWebSocketURL(input.appId) })),
    indicators: protectedProcedure.input(z2.object({
      closes: z2.array(z2.number()).min(5),
      highs: z2.array(z2.number()).optional(),
      lows: z2.array(z2.number()).optional(),
      volumes: z2.array(z2.number()).optional(),
      indicator: z2.enum(["sma", "ema", "rsi", "atr", "bollinger", "macd", "stochastic", "adx", "williams_r", "cci", "obv", "vwap"]),
      period: z2.number().int().min(2).max(200).default(14),
      period2: z2.number().int().min(2).max(200).optional(),
      period3: z2.number().int().min(2).max(200).optional()
    })).mutation(({ input }) => {
      const { closes: closes2, highs, lows, volumes, indicator, period, period2, period3 } = input;
      switch (indicator) {
        case "sma":
          return { indicator: "SMA", values: sma4(closes2, period) };
        case "ema":
          return { indicator: "EMA", values: ema3(closes2, period) };
        case "rsi":
          return { indicator: "RSI", values: rsi2(closes2, period) };
        case "macd": {
          const r = macd2(closes2, period, period2 ?? 26, period3 ?? 9);
          return { indicator: "MACD", values: r };
        }
        case "stochastic": {
          if (!highs || !lows) throw new Error("highs and lows required");
          return { indicator: "Stochastic", values: stochastic2(closes2.map((c, i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period, period2 ?? 3) };
        }
        case "bollinger":
          return { indicator: "Bollinger Bands", values: bollingerBands2(closes2, period) };
        case "atr": {
          if (!highs || !lows) throw new Error("highs and lows required");
          return { indicator: "ATR", values: atr2(closes2.map((c, i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) };
        }
        case "adx": {
          if (!highs || !lows) throw new Error("highs and lows required");
          return { indicator: "ADX", values: adx2(closes2.map((c, i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) };
        }
        case "williams_r": {
          if (!highs || !lows) throw new Error("highs and lows required");
          return { indicator: "Williams %R", values: williamsR2(closes2.map((c, i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) };
        }
        case "cci": {
          if (!highs || !lows) throw new Error("highs and lows required");
          return { indicator: "CCI", values: cci2(closes2.map((c, i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) };
        }
        case "obv": {
          if (!volumes) throw new Error("volumes required");
          return { indicator: "OBV", values: obv2(closes2.map((c, i) => ({ timestamp: i, open: c, high: c, low: c, close: c, volume: volumes[i] }))) };
        }
        case "vwap": {
          if (!volumes) throw new Error("volumes required");
          return { indicator: "VWAP", values: vwap(closes2.map((c, i) => ({ timestamp: i, open: c, high: c, low: c, close: c, volume: volumes[i] }))) };
        }
      }
    })
  }),
  swarm: router({
    agents: protectedProcedure.query(() => listSwarmAgents()),
    run: protectedProcedure.input(z2.object({
      candles: z2.array(z2.object({ timestamp: z2.number(), open: z2.number(), high: z2.number(), low: z2.number(), close: z2.number(), volume: z2.number() })).min(30)
    })).mutation(({ input }) => {
      return runSwarmConsensus(input.candles);
    })
  }),
  sandbox: router({
    execute: protectedProcedure.input(z2.object({
      code: z2.string().min(1).max(1e4),
      timeoutMs: z2.number().int().min(100).max(1e4).default(5e3),
      maxOutputLength: z2.number().int().min(100).max(5e4).default(2e4),
      allowImports: z2.literal(false).default(false)
    })).mutation(async ({ input }) => {
      return executeSandboxedCode(input.code, { timeoutMs: input.timeoutMs, maxOutputLength: input.maxOutputLength, allowImports: false, allowedImports: [] });
    }),
    capabilities: protectedProcedure.query(() => ({
      execution: "isolated-in-process",
      imports: false,
      maxTimeoutMs: 1e4,
      maxOutputLength: 5e4,
      blockedCapabilities: ["filesystem", "network", "process", "dynamic-eval", "child-process"],
      note: "Use E2B for untrusted or dependency-heavy workloads; this sandbox is intended for bounded calculations only."
    }))
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}
async function getAuthenticatedUser(req) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

// server/_core/streamRoute.ts
import { Router } from "express";
var streamRouter = Router();
streamRouter.post("/api/ai/stream", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { model, system, messages: messages2 } = req.body;
    if (!messages2?.length) {
      res.status(400).json({ error: "Messages are required" });
      return;
    }
    const apiUrl = ENV.forgeApiUrl?.replace(/\/$/, "") ?? "https://forge.manus.im";
    const response = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`
      },
      body: JSON.stringify({
        model: model || "nova-2",
        stream: true,
        messages: [
          { role: "system", content: system ?? "You are Nova, a thoughtful and concise AI assistant. Use markdown when it improves clarity." },
          ...messages2
        ]
      })
    });
    if (!response.ok || !response.body) {
      res.status(502).json({ error: "Upstream LLM error" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch {
    }
    res.end();
  } catch (error) {
    console.error("[Stream] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Stream failed" });
    }
  }
});

// server/app.ts
function createApp() {
  const app2 = express();
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  app2.use(streamRouter);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app2;
}
var app = createApp();

// server/vercelEntry.ts
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
