import { useApp } from "../../test/app.js";
import { localDate, zonedTimeToUtc } from "../domain/requests/time.js";

const tomorrow = () => localDate(new Date(Date.now() + 86_400_000), "America/New_York");

const validCreate = () => ({
  category: "electrical",
  urgency: "normal",
  title: "Bathroom exhaust fan rattles",
  description: "The fan makes a loud rattling noise when switched on.",
  location: "bathroom",
  preferredWindows: [{ date: tomorrow(), slot: "morning" }],
  permissionToEnter: true,
});

/** A window tomorrow, 10:00 to 12:00 New York time. */
const visitWindow = () => ({
  start: zonedTimeToUtc(tomorrow(), "10:00", "America/New_York").toISOString(),
  end: zonedTimeToUtc(tomorrow(), "12:00", "America/New_York").toISOString(),
});

type Event = { type: string; fromStatus?: string; toStatus?: string; note?: string };

const api = useApp();

describe("GET /api/requests and /api/requests/:id", () => {
  it("residents see only their own unit", async () => {
    const { body } = await api.as("resident").get("/api/requests").expect(200);
    expect(body.length).toBeGreaterThan(0);
    expect(new Set(body.map((r: { unitId: string }) => r.unitId))).toEqual(
      new Set(["unit_hvl_4b"]),
    );
  });

  it("coordinators see only the active building, and may not list another", async () => {
    const { body } = await api
      .as("coordinator")
      .get("/api/requests?buildingId=bld_harbor")
      .expect(200);
    expect(new Set(body.map((r: { buildingId: string }) => r.buildingId))).toEqual(
      new Set(["bld_harbor"]),
    );
    expect(body[0]).toHaveProperty("unitLabel");
    await api.as("coordinator").get("/api/requests?buildingId=bld_maple").expect(404);
  });

  it("sorts newest first", async () => {
    const { body } = await api.as("coordinator").get("/api/requests").expect(200);
    const times = body.map((r: { createdAt: string }) => r.createdAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("returns 404 for a request outside scope, not 403", async () => {
    await api.as("usr_res_diego").get("/api/requests/req_001").expect(404);
    await api.as("usr_coord_theo").get("/api/requests/req_001").expect(404);
    const { body } = await api.as("manager").get("/api/requests/req_001").expect(200);
    expect(body).toMatchObject({ buildingName: "Harbor View Lofts", timeZone: "America/New_York" });
    expect(body.people.usr_res_amara).toBe("Amara Okafor");
  });

  it("requires a session", async () => {
    await api.http().get("/api/requests").expect(401);
    await api.http().get("/api/requests/req_001").expect(401);
  });
});

describe("POST /api/requests", () => {
  it("creates a request owned by the signed-in resident, ignoring ids in the body", async () => {
    const { body } = await api
      .as("resident")
      .post("/api/requests", {
        ...validCreate(),
        unitId: "unit_hvl_7a",
        residentId: "usr_res_diego",
      })
      .expect(201);
    expect(body).toMatchObject({
      number: "KW-1031",
      status: "new",
      unitId: "unit_hvl_4b",
      residentId: "usr_res_amara",
      buildingId: "bld_harbor",
      coordinatorId: "usr_coord_grace",
      unitLabel: "4B",
    });
    expect(body.timeline.map((event: Event) => event.type)).toEqual(["created"]);
    await api.as("resident").get(`/api/requests/${body.id}`).expect(200);
  });

  it("rejects invalid input with field errors, and other roles with 403", async () => {
    const { body } = await api
      .as("resident")
      .post("/api/requests", { ...validCreate(), title: "x" })
      .expect(422);
    expect(body.errors).toHaveProperty("title");
    await api.as("coordinator").post("/api/requests", validCreate()).expect(403);
  });
});

describe("workflow actions", () => {
  const coordinator = () => api.as("coordinator");

  it("moves KW-1030 from new to resolved with a timeline event per step", async () => {
    await coordinator().post("/api/requests/req_030/triage", { urgency: "emergency" }).expect(200);
    await coordinator()
      .post("/api/requests/req_030/assign", { vendorId: "ven_tidewater" })
      .expect(200);
    const scheduled = await coordinator()
      .post("/api/requests/req_030/schedule", visitWindow())
      .expect(200);
    expect(scheduled.body).toMatchObject({
      status: "scheduled",
      vendorName: "Tidewater Plumbing Co.",
    });
    await coordinator().post("/api/requests/req_030/start").expect(200);
    const { body } = await coordinator()
      .post("/api/requests/req_030/resolve", { resolutionNote: "Replaced valve." })
      .expect(200);
    expect(body.status).toBe("resolved");
    expect(body.resolvedAt).not.toBeNull();
    expect(body.timeline.slice(1).map((e: Event) => [e.fromStatus, e.toStatus])).toEqual([
      ["new", "triaged"],
      ["triaged", "triaged"],
      ["triaged", "scheduled"],
      ["scheduled", "in_progress"],
      ["in_progress", "resolved"],
    ]);
    expect(body.timeline.map((e: Event) => e.type)).toEqual([
      "created",
      "triaged",
      "vendor_assigned",
      "scheduled",
      "started",
      "resolved",
    ]);
  });

  it("returns 409 for a transition the status machine doesn't allow", async () => {
    const res = await coordinator().post("/api/requests/req_030/start").expect(409);
    expect(res.body.code).toBe("INVALID_TRANSITION");
    await coordinator()
      .post("/api/requests/req_030/assign", { vendorId: "ven_tidewater" })
      .expect(409);
    await coordinator()
      .post("/api/requests/req_001/resolve", { resolutionNote: "Again" })
      .expect(409);
    // KW-1012 is triaged without a vendor.
    const vendor = await coordinator()
      .post("/api/requests/req_012/schedule", visitWindow())
      .expect(409);
    expect(vendor.body.code).toBe("VENDOR_REQUIRED");
  });

  it("validates bodies with 422", async () => {
    await coordinator().post("/api/requests/req_030/triage", { urgency: "soon" }).expect(422);
    const past = { start: "2020-01-01T15:00:00Z", end: "2020-01-01T16:00:00Z" };
    await coordinator().post("/api/requests/req_014/schedule", past).expect(422);
    await coordinator()
      .post("/api/requests/req_014/assign", { vendorId: "ven_nobody" })
      .expect(422);
    await coordinator().post("/api/requests/req_017/resolve", { resolutionNote: "" }).expect(422);
  });

  it("rejects a vendor who doesn't serve the request's building with 422", async () => {
    // Plumb & Level serves Harbor and Maple, not The Linden (KW-1019).
    const { body } = await api
      .as("usr_coord_theo")
      .post("/api/requests/req_019/assign", { vendorId: "ven_plumblevel" })
      .expect(422);
    expect(body.errors).toHaveProperty("vendorId");
  });

  it("is 403 for the wrong role and 404 out of scope", async () => {
    await api.as("resident").post("/api/requests/req_030/triage", {}).expect(403);
    await api.as("usr_res_diego").post("/api/requests/req_030/triage", {}).expect(404);
    await api.as("usr_coord_theo").post("/api/requests/req_030/triage", {}).expect(404);
    await api.as("manager").post("/api/requests/req_030/triage", {}).expect(403);
    await api.as("manager").post("/api/requests/req_030/archive", {}).expect(404);
  });

  it("lets a resident cancel their own new request, with an optional reason", async () => {
    const { body } = await api
      .as("resident")
      .post("/api/requests/req_030/cancel", { reason: "Fixed it myself." })
      .expect(200);
    expect(body.status).toBe("cancelled");
    expect(body.timeline.at(-1)).toMatchObject({
      type: "cancelled",
      fromStatus: "new",
      toStatus: "cancelled",
      note: "Fixed it myself.",
    });
    await api.as("resident").post("/api/requests/req_030/cancel", {}).expect(409);
    await api.as("resident").post("/api/requests/req_001/cancel", {}).expect(409);
  });

  it("lets only the resident who reported it cancel a request", async () => {
    await coordinator().post("/api/requests/req_030/cancel", {}).expect(403);
    await api.as("usr_res_diego").post("/api/requests/req_030/cancel", {}).expect(404);
    await api
      .as("resident")
      .post("/api/requests/req_030/cancel", { reason: "x".repeat(501) })
      .expect(422);
  });

  it("reopens a request resolved in the last 7 days, with the reason on the timeline", async () => {
    const { body } = await api
      .as("usr_res_meilin")
      .post("/api/requests/req_016/reopen", { reason: "It flickers again." })
      .expect(200);
    expect(body).toMatchObject({ status: "in_progress", resolvedAt: null });
    expect(body.timeline.at(-1)).toMatchObject({
      type: "reopened",
      fromStatus: "resolved",
      toStatus: "in_progress",
      note: "It flickers again.",
    });
    await api
      .as("usr_res_meilin")
      .post("/api/requests/req_016/reopen", { reason: "Once more" })
      .expect(409);
  });

  it("reopens only within 7 days, with a reason, for the resident or a coordinator", async () => {
    const late = await api
      .as("resident")
      .post("/api/requests/req_001/reopen", { reason: "Slow again." })
      .expect(409);
    expect(late.body.code).toBe("REOPEN_WINDOW_CLOSED");
    await api
      .as("resident")
      .post("/api/requests/req_016/reopen", { reason: "Still broken" })
      .expect(404);
    await api
      .as("usr_res_meilin")
      .post("/api/requests/req_016/reopen", { reason: "no" })
      .expect(422);
    await api
      .as("manager")
      .post("/api/requests/req_016/reopen", { reason: "Still broken" })
      .expect(403);
    const { body } = await coordinator()
      .post("/api/requests/req_016/reopen", { reason: "Vendor is coming back." })
      .expect(200);
    expect(body.status).toBe("in_progress");
  });

  it("requires a session", async () => {
    await api.http().post("/api/requests/req_030/triage").send({}).expect(401);
    await api.http().post("/api/requests").send(validCreate()).expect(401);
  });
});

describe("GET /api/vendors", () => {
  it("lists vendors serving the active building only", async () => {
    const maple = await api.as("coordinator", "bld_maple").get("/api/vendors").expect(200);
    expect(
      maple.body.every((vendor: { buildingIds: string[] }) =>
        vendor.buildingIds.includes("bld_maple"),
      ),
    ).toBe(true);
    const linden = await api.as("usr_coord_theo").get("/api/vendors").expect(200);
    expect(linden.body.map((vendor: { id: string }) => vendor.id)).not.toContain("ven_plumblevel");
    await api.as("usr_coord_theo").get("/api/vendors?buildingId=bld_harbor").expect(404);
    await api.as("resident").get("/api/vendors").expect(403);
  });
});
