// Synced from keyway/src/features/messages/unread.ts by `npm run sync:domain`. Edit it there, not here.
import type { Message, Thread } from "./schema.js";

/** Messages by others since the user last opened the thread (data-model.md). */
export function unreadCount(
  thread: Pick<Thread, "id" | "lastReadAt">,
  messages: readonly Message[],
  userId: string,
) {
  const lastRead = thread.lastReadAt[userId] ?? null;
  return messages.filter(
    (message) =>
      message.threadId === thread.id &&
      message.authorId !== userId &&
      (lastRead === null || message.createdAt > lastRead),
  ).length;
}
