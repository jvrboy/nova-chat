import { z } from "zod";
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
