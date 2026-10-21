import { useApp } from "../../test/app.js";

const sessionCookie = (res: { headers: Record<string, unknown> }) =>
  ([] as string[])
    .concat((res.headers["set-cookie"] as string[] | undefined) ?? [])
    .find((cookie) => cookie.startsWith("keyway_session="));

describe("session endpoints", () => {
  const api = useApp();

  it("lists demo people with their building or unit, without a session", async () => {
    const res = await api.http().get("/api/demo/people").expect(200);
    expect(res.body).toContainEqual(
      expect.objectContaining({ name: "Amara Okafor", context: "Harbor View Lofts · 4B" }),
    );
    expect(res.body).toContainEqual(
      expect.objectContaining({ name: "Grace Adeyemi", context: "Harbor View Lofts, Maple Court" }),
    );
  });

  it("signs in with an httpOnly cookie, reads the session and signs out", async () => {
    await api.http().get("/api/session").expect(401);
    const res = await api
      .http()
      .post("/api/session")
      .send({ userId: "usr_coord_grace" })
      .expect(200);
    expect(res.body.user.activeBuildingId).toBe("bld_harbor");
    expect(res.body.buildings.map((b: { name: string }) => b.name)).toEqual([
      "Harbor View Lofts",
      "Maple Court",
    ]);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/^keyway_session=coordinator\.usr_coord_grace\.bld_harbor;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const me = await api
      .http()
      .get("/api/session")
      .set("Cookie", cookie!.split(";")[0]!)
      .expect(200);
    expect(me.body.user.name).toBe("Grace Adeyemi");

    const out = await api.http().delete("/api/session").expect(204);
    expect(sessionCookie(out)).toMatch(/^keyway_session=;.*Expires=Thu, 01 Jan 1970/);
  });

  it("rejects unknown people (404) and malformed bodies (422)", async () => {
    await api.http().post("/api/session").send({ userId: "usr_nobody" }).expect(404);
    const res = await api.http().post("/api/session").send({}).expect(422);
    expect(res.body.errors).toHaveProperty("userId");
  });

  it("answers malformed JSON with 422, not a crash", async () => {
    await api
      .http()
      .post("/api/session")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(422);
  });

  it("switches only to covered buildings", async () => {
    const res = await api
      .as("coordinator")
      .put("/api/session/building", { buildingId: "bld_maple" })
      .expect(200);
    expect(res.body.user.activeBuildingId).toBe("bld_maple");
    expect(sessionCookie(res)).toMatch(/bld_maple/);
    await api
      .as("coordinator")
      .put("/api/session/building", { buildingId: "bld_linden" })
      .expect(404);
  });

  it("does not let residents switch", async () => {
    await api.as("resident").put("/api/session/building", { buildingId: "bld_harbor" }).expect(403);
  });

  it("ignores a forged active building outside the user's scope", async () => {
    const res = await api.as("coordinator", "bld_linden").get("/api/session").expect(200);
    expect(res.body.user.activeBuildingId).toBe("bld_harbor");
  });

  it("rejects a forged role", async () => {
    await api
      .http()
      .get("/api/session")
      .set("Cookie", "keyway_session=manager.usr_res_amara.bld_harbor")
      .expect(401);
  });

  it("re-seeds on demo reset", async () => {
    await api.as("resident").post("/api/demo/reset").expect(204);
    const res = await api.http().get("/api/demo/people").expect(200);
    expect(res.body).toHaveLength(9);
  });
});
