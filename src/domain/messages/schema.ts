// Synced from keyway/src/features/messages/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";

export const MESSAGE_MAX_LENGTH = 2000;
export const SUBJECT_MAX_LENGTH = 80;

export const threadSchema = z.object({
  id: z.string(),
  /** null for a general chat that isn't about a request. */
  requestId: z.string().nullable(),
  subject: z.string().nullable().default(null),
  buildingId: z.string(),
  residentId: z.string(),
  coordinatorId: z.string(),
  createdAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime(),
  lastReadAt: z.record(z.string(), z.iso.datetime().nullable()),
});
export type Thread = z.infer<typeof threadSchema>;

export const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  authorId: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

const bodySchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(MESSAGE_MAX_LENGTH, "Keep messages under 2,000 characters.");

export const messageCreateSchema = z.object({ body: bodySchema });

/** POST /api/threads: a resident starts a general chat with their coordinator. */
export const chatCreateSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Add a subject (at least 3 characters).")
    .max(SUBJECT_MAX_LENGTH, "Keep the subject under 80 characters."),
  body: bodySchema,
});
export type ChatCreateInput = z.infer<typeof chatCreateSchema>;

const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["resident", "coordinator", "manager"]),
});
export type Participant = z.infer<typeof participantSchema>;

const requestRefSchema = z.object({ id: z.string(), number: z.string(), title: z.string() });

/**
 * A conversation's address: the request id for a request thread, the thread id for a general chat.
 * Request threads keep their request id so links work before the first message.
 */
export const conversationId = (thread: { id: string; requestId: string | null }) =>
  thread.requestId ?? thread.id;

/** GET /api/threads: one row per conversation, newest activity first. */
const threadSummarySchema = z.object({
  id: z.string(),
  requestId: z.string().nullable(),
  request: requestRefSchema.nullable(),
  subject: z.string().nullable(),
  resident: participantSchema,
  lastMessage: messageSchema.extend({ authorName: z.string() }).nullable(),
  lastMessageAt: z.iso.datetime(),
  unreadCount: z.number().int().nonnegative(),
});
export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export const threadSummaryListSchema = z.array(threadSummarySchema);

/** GET /api/threads/:id/messages. `thread` is null until a request's first message. */
export const threadDetailSchema = z.object({
  request: requestRefSchema.nullable(),
  subject: z.string().nullable(),
  thread: threadSchema.nullable(),
  participants: z.array(participantSchema),
  messages: z.array(messageSchema),
});
export type ThreadDetail = z.infer<typeof threadDetailSchema>;
