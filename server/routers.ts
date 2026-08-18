import { z } from "zod";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createConversation,
  createMessage,
  createProject,
  getConversation,
  listConversations,
  listProjects,
  updateConversation,
  updateProject,
} from "./db";

const projectInput = z.object({ name: z.string().min(1).max(160), description: z.string().max(2000).optional(), instructions: z.string().max(10000).optional() });
const conversationInput = z.object({ title: z.string().min(1).max(240), projectId: z.number().int().positive().optional(), model: z.string().max(64).optional() });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => listProjects(ctx.user.id)),
    create: protectedProcedure.input(projectInput).mutation(({ ctx, input }) => createProject({ ...input, userId: ctx.user.id })),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(160).optional(), description: z.string().max(2000).optional(), instructions: z.string().max(10000).optional() })).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return updateProject(ctx.user.id, id, values);
    }),
  }),
  web: router({
    search: protectedProcedure.input(z.object({ query: z.string().min(2).max(240) })).mutation(async ({ input }) => {
      const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`);
      if (!response.ok) throw new Error(`Web search failed (${response.status})`);
      const payload = await response.json() as { Heading?: string; AbstractText?: string; AbstractURL?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> };
      return { heading: payload.Heading ?? input.query, abstractText: payload.AbstractText ?? "No direct summary was found. Try a more specific query.", abstractUrl: payload.AbstractURL ?? null, relatedTopics: (payload.RelatedTopics ?? []).filter((topic) => topic.Text).slice(0, 5).map((topic) => ({ text: topic.Text!, url: topic.FirstURL ?? null })) };
    }),
  }),
  ai: router({
    models: protectedProcedure.query(async () => (await listLLMModels()).data),
    complete: protectedProcedure.input(z.object({ model: z.string().optional(), system: z.string().optional(), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).min(1) })).mutation(async ({ input }) => {
      const response = await invokeLLM({ model: input.model, messages: [{ role: "system", content: input.system ?? "You are Nova, a thoughtful and concise AI assistant. Use markdown when it improves clarity." }, ...input.messages] });
      const content = response.choices[0]?.message.content;
      return { model: response.model, content: typeof content === "string" ? content : content.map((part) => part.type === "text" ? part.text : "").join("\n") };
    }),
    createArtifact: protectedProcedure.input(z.object({ model: z.string().optional(), kind: z.enum(["document", "plan", "table", "code"]), prompt: z.string().min(3).max(6000), context: z.string().max(12000).optional() })).mutation(async ({ input }) => {
      const kindLabel = { document: "a polished document", plan: "an actionable plan", table: "a clear markdown table", code: "a focused code artifact" }[input.kind];
      const response = await invokeLLM({ model: input.model, messages: [{ role: "system", content: `You create ${kindLabel} for Nova. Return only valid JSON matching the requested schema. Make the content useful, self-contained, and formatted as markdown when appropriate.` }, { role: "user", content: `Create ${kindLabel} from this request:\n${input.prompt}\n\nConversation context:\n${input.context ?? "No additional context."}` }], response_format: { type: "json_schema", json_schema: { name: "nova_artifact", strict: true, schema: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, content: { type: "string" }, language: { type: "string" } }, required: ["title", "summary", "content", "language"], additionalProperties: false } } } });
      const raw = response.choices[0]?.message.content;
      const parsed = JSON.parse(typeof raw === "string" ? raw : raw.map((part) => part.type === "text" ? part.text : "").join(""));
      return { ...parsed, kind: input.kind, model: response.model };
    }),
  }),
  conversations: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => listConversations(ctx.user.id, input?.projectId)),
    create: protectedProcedure.input(conversationInput).mutation(({ ctx, input }) => createConversation({ ...input, userId: ctx.user.id, model: input.model ?? "nova-2" })),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => getConversation(ctx.user.id, input.id)),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(1).max(240).optional(), model: z.string().max(64).optional(), projectId: z.number().int().positive().nullable().optional(), isStarred: z.boolean().optional(), isArchived: z.boolean().optional() })).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return updateConversation(ctx.user.id, id, values);
    }),
    addMessage: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), role: z.enum(["user", "assistant"]), content: z.string().min(1) })).mutation(({ ctx, input }) => createMessage(input)),
  }),
});

export type AppRouter = typeof appRouter;
