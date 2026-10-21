import { useApp } from "../../test/app.js";

type Summary = {
  id: string;
  requestId: string | null;
  request: { number: string } | null;
  subject: string | null;
  unreadCount: number;
  lastMessage: { authorName: string } | null;
};
const label = (thread: Summary) => thread.request?.number ?? thread.subject;

const api = useApp();
const list = async (who: string, buildingId?: string) =>
  (
    await api
      .as(who)
      .get(`/api/threads${buildingId ? `?buildingId=${buildingId}` : ""}`)
      .expect(200)
  ).body as Summary[];

describe("thread endpoints", () => {
  it("lists a resident's own threads with unread counts", async () => {
    const threads = await list("resident");
    expect(threads.map(label)).toEqual(["KW-1023", "Guest parking this weekend"]);
    expect(threads[0]?.unreadCount).toBe(1);
    expect(threads[0]?.lastMessage?.authorName).toBeTruthy();
  });

  it("lists only the coordinator's active building, newest activity first", async () => {
    const harbor = await list("coordinator", "bld_harbor");
    expect(harbor.map(label)).toEqual(["KW-1017", "KW-1023", "Guest parking this weekend"]);
    expect(harbor.find((t) => label(t) === "KW-1017")?.unreadCount).toBe(1);
    await api.as("coordinator").get("/api/threads?buildingId=bld_maple").expect(404);
    const maple = (await api.as("coordinator", "bld_maple").get("/api/threads").expect(200))
      .body as Summary[];
    expect(maple.find((t) => label(t) === "KW-1029")?.unreadCount).toBe(2);
  });

  it("hides uncovered buildings (404) and denies the manager (403)", async () => {
    await api.as("usr_coord_theo").get("/api/threads?buildingId=bld_harbor").expect(404);
    await api.as("usr_coord_theo").get("/api/threads/req_017/messages").expect(404);
    await api.as("manager").get("/api/threads").expect(403);
    await api.as("manager").get("/api/threads/req_017/messages").expect(403);
    await api.as("manager").post("/api/threads/req_017/messages", { body: "Hi" }).expect(403);
  });

  it("returns 401 without a session", async () => {
    await api.http().get("/api/threads").expect(401);
    await api.http().get("/api/threads/req_017/messages").expect(401);
    await api.http().post("/api/threads/req_017/read").expect(401);
  });

  it("returns a thread's messages oldest first, with participants", async () => {
    const { body } = await api.as("coordinator").get("/api/threads/req_017/messages").expect(200);
    expect(body.request.number).toBe("KW-1017");
    expect(body.messages).toHaveLength(5);
    const times = body.messages.map((m: { createdAt: string }) => m.createdAt);
    expect(times).toEqual([...times].sort());
    expect(body.participants.map((p: { name: string }) => p.name)).toEqual([
      "Diego Santillán",
      "Grace Adeyemi",
    ]);
  });

  it("keeps residents inside their unit, even in the same building", async () => {
    await api.as("usr_res_diego").get("/api/threads/req_023/messages").expect(404);
    await api.as("usr_res_diego").post("/api/threads/req_023/messages", { body: "Hi" }).expect(404);
    await api.as("usr_res_diego").get("/api/threads/does-not-exist/messages").expect(404);
  });

  it("sends a trimmed message and shows it to the other side as unread", async () => {
    const sent = await api
      .as("coordinator")
      .post("/api/threads/req_017/messages", { body: "  Plumber confirmed.  " })
      .expect(201);
    expect(sent.body).toMatchObject({ body: "Plumber confirmed.", authorId: "usr_coord_grace" });

    const { body } = await api.as("usr_res_diego").get("/api/threads/req_017/messages").expect(200);
    expect(body.messages.at(-1).body).toBe("Plumber confirmed.");
    expect((await list("usr_res_diego"))[0]?.unreadCount).toBe(1);
  });

  it("creates a request's thread with the first message, once", async () => {
    const before = await api.as("resident").get("/api/threads/req_030/messages").expect(200);
    expect(before.body.thread).toBeNull();
    await Promise.all([
      api.as("resident").post("/api/threads/req_030/messages", { body: "Is someone coming?" }),
      api.as("coordinator").post("/api/threads/req_030/messages", { body: "Yes, today." }),
    ]);
    const { body } = await api.as("resident").get("/api/threads/req_030/messages").expect(200);
    expect(body.thread).toMatchObject({ buildingId: "bld_harbor", residentId: "usr_res_amara" });
    expect(body.messages).toHaveLength(2);
  });

  it("rejects empty, whitespace-only and too-long messages (422)", async () => {
    const send = (body: object) => api.as("resident").post("/api/threads/req_023/messages", body);
    await send({ body: "   " }).expect(422);
    await send({}).expect(422);
    await send({ body: "x".repeat(2001) }).expect(422);
  });

  it("marks a thread read for the caller only", async () => {
    await api.as("resident").post("/api/threads/req_023/read").expect(204);
    expect((await list("resident"))[0]?.unreadCount).toBe(0);
    await api.as("resident").post("/api/threads/req_030/read").expect(204); // no thread yet
    expect((await list("coordinator")).find((t) => t.requestId === "req_017")?.unreadCount).toBe(1);
  });
});

describe("general chats", () => {
  const chat = { subject: "Bike storage key", body: "Where do I get a key for the bike room?" };

  it("lets a resident start a chat with their building's coordinator", async () => {
    const { body: thread } = await api.as("resident").post("/api/threads", chat).expect(201);
    expect(thread).toMatchObject({
      requestId: null,
      subject: "Bike storage key",
      buildingId: "bld_harbor",
      residentId: "usr_res_amara",
      coordinatorId: "usr_coord_grace",
    });
    const { body: detail } = await api
      .as("resident")
      .get(`/api/threads/${thread.id}/messages`)
      .expect(200);
    expect(detail).toMatchObject({ request: null, subject: "Bike storage key" });
    expect(detail.messages.map((m: { body: string }) => m.body)).toEqual([chat.body]);
    expect((await list("resident"))[0]).toMatchObject({ subject: chat.subject, unreadCount: 0 });

    expect((await list("coordinator")).find((t) => t.id === thread.id)?.unreadCount).toBe(1);
    await api
      .as("coordinator")
      .post(`/api/threads/${thread.id}/messages`, { body: "The front desk has them." })
      .expect(201);
    expect((await list("resident")).find((t) => t.id === thread.id)?.unreadCount).toBe(1);
  });

  it("validates the subject and message (422) and is resident-only (403)", async () => {
    await api.as("resident").post("/api/threads", { subject: "Hi", body: "Question" }).expect(422);
    await api
      .as("resident")
      .post("/api/threads", { ...chat, body: "  " })
      .expect(422);
    await api
      .as("resident")
      .post("/api/threads", { ...chat, subject: "x".repeat(81) })
      .expect(422);
    await api.as("coordinator").post("/api/threads", chat).expect(403);
    await api.as("manager").post("/api/threads", chat).expect(403);
  });

  it("keeps chats inside the resident and the covering coordinators (404)", async () => {
    await api.as("usr_res_diego").get("/api/threads/thr_028/messages").expect(404);
    await api.as("usr_res_diego").post("/api/threads/thr_028/messages", { body: "Hi" }).expect(404);
    await api.as("usr_coord_theo").get("/api/threads/thr_028/messages").expect(404);
    const { body } = await api
      .as("usr_coord_theo")
      .get("/api/threads/thr_029/messages")
      .expect(200);
    expect(body.subject).toBe("Moving a sofa in on Saturday");
    await api.as("manager").get("/api/threads/thr_028/messages").expect(403);
    // A request's thread is only reachable by its request id.
    await api.as("resident").get("/api/threads/thr_001/messages").expect(404);
  });
});
