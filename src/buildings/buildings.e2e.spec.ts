import { useApp } from "../../test/app.js";

const api = useApp();
const move = (buildingId: string, fromId: string, toId: string, who = "manager") =>
  api.as(who).post(`/api/buildings/${buildingId}/coordinator`).send({ fromId, toId });

describe("GET /api/buildings/coverage", () => {
  it("shows the manager who covers each building", async () => {
    const { body } = await api.as("manager").get("/api/buildings/coverage").expect(200);
    const maple = body.buildings.find((b: { id: string }) => b.id === "bld_maple");
    expect(maple.coordinatorIds).toEqual(["usr_coord_grace"]);
    expect(body.coordinators.map((c: { id: string }) => c.id).sort()).toEqual([
      "usr_coord_grace",
      "usr_coord_theo",
    ]);
    await api.as("coordinator").get("/api/buildings/coverage").expect(403);
    await api.as("resident").get("/api/buildings/coverage").expect(403);
  });
});

describe("POST /api/buildings/:id/coordinator", () => {
  it("moves Maple Court from Grace to Theo with its open requests", async () => {
    const before = (await api.as("coordinator", "bld_maple").get("/api/requests").expect(200)).body;
    const { body } = await move("bld_maple", "usr_coord_grace", "usr_coord_theo").expect(200);
    const maple = body.buildings.find((b: { id: string }) => b.id === "bld_maple");
    expect(maple.coordinatorIds).toEqual(["usr_coord_theo"]);

    const theo = (await api.as("usr_coord_theo").get("/api/session").expect(200)).body;
    expect(theo.buildings.map((b: { id: string }) => b.id)).toContain("bld_maple");
    const grace = (await api.as("usr_coord_grace", "bld_harbor").get("/api/session").expect(200))
      .body;
    expect(grace.buildings.map((b: { id: string }) => b.id)).toEqual(["bld_harbor"]);

    const after = (await api.as("usr_coord_theo", "bld_maple").get("/api/requests").expect(200))
      .body;
    expect(after.length).toBe(before.length);
  });

  it("refuses moves that don't fit the coverage", async () => {
    await move("bld_maple", "usr_coord_theo", "usr_coord_grace").expect(409);
    const last = await move("bld_linden", "usr_coord_theo", "usr_coord_grace").expect(409);
    expect(last.body.code).toBe("LAST_BUILDING");
    await move("bld_maple", "usr_coord_grace", "usr_coord_grace").expect(422);
    await move("bld_maple", "usr_coord_grace", "usr_res_amara").expect(404);
    await move("bld_nowhere", "usr_coord_grace", "usr_coord_theo").expect(404);
    await move("bld_maple", "usr_coord_grace", "usr_coord_theo", "coordinator").expect(403);
  });
});
