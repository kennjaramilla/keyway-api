import { Injectable } from "@nestjs/common";
import { authorize } from "../auth/authorize.js";
import { newId } from "../common/ids.js";
import { conflict, notFound } from "../common/problem.js";
import { Store } from "../database/store.js";
import { can } from "../domain/auth/permissions.js";
import type {
  ChatCreateInput,
  Message,
  Participant,
  Thread,
  ThreadDetail,
  ThreadSummary,
} from "../domain/messages/schema.js";
import { unreadCount } from "../domain/messages/unread.js";
import type { MaintenanceRequest } from "../domain/requests/schema.js";
import type { SessionUser } from "../domain/session/schema.js";

type Conversation =
  { request: MaintenanceRequest; thread: Thread | null } | { request: null; thread: Thread };

/** A conversation's resource for can(): its building and resident. */
const resource = (owner: { buildingId: string; residentId: string }) => ({
  buildingId: owner.buildingId,
  residentId: owner.residentId,
});

/** Residents see their own chats; staff see chats in buildings they cover. */
const inScope = (user: SessionUser, thread: Thread) =>
  user.role === "resident"
    ? thread.residentId === user.id
    : user.buildingIds.includes(thread.buildingId);

@Injectable()
export class ThreadsService {
  constructor(private readonly store: Store) {}

  private async participants(ids: string[]): Promise<Participant[]> {
    const users = await this.store.find("users", { _id: { $in: ids } });
    return ids.map((id) => {
      const user = users.find((candidate) => candidate.id === id);
      return { id, name: user?.name ?? "Former user", role: user?.role ?? "resident" };
    });
  }

  /** Residents: their own threads. Staff: the active building only. Newest activity first. */
  async list(user: SessionUser, buildingId = user.activeBuildingId): Promise<ThreadSummary[]> {
    authorize(user, "thread:view", { buildingId });
    if (user.role !== "resident" && buildingId !== user.activeBuildingId) throw notFound();

    const threads = await this.store.find(
      "threads",
      user.role === "resident" ? { residentId: user.id } : { buildingId },
    );
    const threadIds = threads.map((thread) => thread.id);
    const [requests, messages, people] = await Promise.all([
      this.store.find("requests", {
        _id: { $in: threads.flatMap((t) => (t.requestId ? [t.requestId] : [])) },
      }),
      this.store.find("messages", { threadId: { $in: threadIds } }),
      this.participants([...new Set(threads.flatMap((t) => [t.residentId, t.coordinatorId]))]),
    ]);
    const person = (id: string) =>
      people.find((p) => p.id === id) ?? { id, name: "Former user", role: "resident" as const };

    return threads
      .flatMap((thread) => {
        const request = thread.requestId
          ? requests.find((item) => item.id === thread.requestId)
          : null;
        if (request === undefined || (request && !can(user, "request:view", request))) return [];
        const own = messages.filter((message) => message.threadId === thread.id);
        const last = own.reduce<Message | null>(
          (latest, message) => (!latest || message.createdAt > latest.createdAt ? message : latest),
          null,
        );
        return [
          {
            id: thread.id,
            requestId: thread.requestId,
            request: request && { id: request.id, number: request.number, title: request.title },
            subject: thread.subject,
            resident: person(thread.residentId),
            lastMessage: last && { ...last, authorName: person(last.authorId).name },
            lastMessageAt: thread.lastMessageAt,
            unreadCount: unreadCount(thread, own, user.id),
          },
        ];
      })
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }

  /**
   * By request id (request thread) or thread id (general chat): 404 if missing or
   * out of scope (checked before the role), 403 for the wrong role.
   */
  private async find(user: SessionUser, id: string): Promise<Conversation> {
    const request = await this.store.findById("requests", id);
    if (request) {
      if (!can(user, "request:view", request)) throw notFound("Conversation");
      authorize(user, "thread:view", resource(request), "Conversation");
      return { request, thread: await this.store.findOne("threads", { requestId: request.id }) };
    }
    const thread = await this.store.findOne("threads", { _id: id, requestId: null });
    if (!thread || !inScope(user, thread)) throw notFound("Conversation");
    authorize(user, "thread:view", resource(thread), "Conversation");
    return { request: null, thread };
  }

  async detail(user: SessionUser, id: string): Promise<ThreadDetail> {
    const { request, thread } = await this.find(user, id);
    const people = request ?? thread;
    const [participants, messages] = await Promise.all([
      this.participants([people.residentId, people.coordinatorId]),
      thread ? this.store.find("messages", { threadId: thread.id }) : [],
    ]);
    return {
      request: request && { id: request.id, number: request.number, title: request.title },
      subject: thread?.subject ?? null,
      thread,
      participants,
      messages: messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }

  /** A request's thread is created with its first message. */
  async send(user: SessionUser, id: string, body: string): Promise<Message> {
    const conversation = await this.find(user, id);
    authorize(user, "message:send", resource(conversation.request ?? conversation.thread));
    const now = new Date().toISOString();

    let thread = conversation.thread;
    if (!thread && conversation.request) {
      const { request } = conversation;
      // Upsert so two first messages at once still share one thread.
      const doc = await this.store
        .model("threads")
        .findOneAndUpdate(
          { requestId: request.id },
          {
            $setOnInsert: {
              _id: newId("thr"),
              requestId: request.id,
              subject: null,
              buildingId: request.buildingId,
              residentId: request.residentId,
              coordinatorId: request.coordinatorId,
              createdAt: now,
              lastMessageAt: now,
              lastReadAt: {},
            },
          },
          { upsert: true, returnDocument: "after" },
        )
        .lean<{ _id: string }>();
      thread = (await this.store.findById("threads", doc?._id))!;
    }
    if (!thread) throw notFound("Conversation");

    const message: Message = {
      id: newId("msg"),
      threadId: thread.id,
      authorId: user.id,
      body,
      createdAt: now,
    };
    await this.store.insert("messages", [message]);
    await this.store
      .model("threads")
      .updateOne(
        { _id: thread.id },
        { $set: { lastMessageAt: now, [`lastReadAt.${user.id}`]: now } },
      );
    return message;
  }

  /** Mark read for the caller. A request with no thread yet has nothing to mark. */
  async markRead(user: SessionUser, id: string) {
    const { thread } = await this.find(user, id);
    if (!thread) return;
    await this.store
      .model("threads")
      .updateOne(
        { _id: thread.id },
        { $set: { [`lastReadAt.${user.id}`]: new Date().toISOString() } },
      );
  }

  /** A resident starts a general chat with their building's first coordinator. */
  async startChat(user: SessionUser, input: ChatCreateInput): Promise<Thread> {
    authorize(user, "thread:create", { residentId: user.id });
    const building = await this.store.findById("buildings", user.activeBuildingId);
    const coordinatorId = building?.coordinatorIds[0];
    if (!building || !coordinatorId) {
      throw conflict("NO_COORDINATOR", "This building has no coordinator yet.");
    }
    const now = new Date().toISOString();
    const thread: Thread = {
      id: newId("thr"),
      requestId: null,
      subject: input.subject,
      buildingId: building.id,
      residentId: user.id,
      coordinatorId,
      createdAt: now,
      lastMessageAt: now,
      lastReadAt: { [user.id]: now },
    };
    await this.store.insert("threads", [thread]);
    await this.store.insert("messages", [
      {
        id: newId("msg"),
        threadId: thread.id,
        authorId: user.id,
        body: input.body,
        createdAt: now,
      },
    ]);
    return thread;
  }
}
