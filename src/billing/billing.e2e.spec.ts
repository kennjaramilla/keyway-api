import { useApp } from "../../test/app.js";

type Charge = { id: string; residentId: string; paidAt: string | null; dueAt: string };
const api = useApp();
const account = async (who = "resident") =>
  (await api.as(who).get("/api/billing").expect(200)).body as {
    charges: Charge[];
    payments: { id: string; residentId: string }[];
    balanceCents: number;
    overdueCents: number;
  };
const openIds = async (who = "resident") =>
  (await account(who)).charges.filter((charge) => !charge.paidAt).map((charge) => charge.id);

describe("resident billing", () => {
  it("returns the resident's own charges and payments with totals", async () => {
    const { charges, payments, balanceCents, overdueCents } = await account();
    expect(charges.every((charge) => charge.residentId === "usr_res_amara")).toBe(true);
    expect(payments.every((payment) => payment.residentId === "usr_res_amara")).toBe(true);
    expect(balanceCents).toBe(245000 + 8640); // November rent plus September water
    expect(overdueCents).toBe(0);
    const due = charges.map((charge) => charge.dueAt);
    expect(due).toEqual([...due].sort().reverse());
  });

  it("counts unpaid charges past their due date as overdue", async () => {
    const { overdueCents, balanceCents } = await account("usr_res_diego");
    expect(overdueCents).toBe(280000);
    expect(balanceCents).toBe(280000 * 2 + 7500);
  });

  it("is resident-only (403) and needs a session (401)", async () => {
    await api.http().get("/api/billing").expect(401);
    await api.as("coordinator").get("/api/billing").expect(403);
    await api
      .as("coordinator")
      .post("/api/billing/payments", { chargeIds: ["chg_001"], method: "card" })
      .expect(403);
    await api.as("manager").get("/api/billing").expect(403);
    await api.as("resident").get("/api/billing/units").expect(403);
  });

  it("pays open charges and records one payment", async () => {
    const { body: payment } = await api
      .as("resident")
      .post("/api/billing/payments", { chargeIds: await openIds(), method: "bank" })
      .expect(201);
    expect(payment).toMatchObject({
      amountCents: 253640,
      method: "bank",
      residentId: "usr_res_amara",
    });
    expect(payment.reference).toMatch(/^PAY-\d+$/);
    const after = await account();
    expect(after.balanceCents).toBe(0);
    expect(after.payments[0]?.id).toBe(payment.id);
  });

  it("pays once when the same charges are submitted twice at once", async () => {
    const body = { chargeIds: await openIds(), method: "card" };
    const results = await Promise.all([
      api.as("resident").post("/api/billing/payments", body),
      api.as("resident").post("/api/billing/payments", body),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const { payments, balanceCents } = await account();
    expect(balanceCents).toBe(0);
    expect(
      payments.filter((p) => p.id === results.find((r) => r.status === 201)?.body.id),
    ).toHaveLength(1);
  });

  it("rejects paid (409), foreign (404) and invalid (422) charges", async () => {
    const pay = (body: object) => api.as("resident").post("/api/billing/payments", body);
    const paid = (await account()).charges.find((charge) => charge.paidAt);
    await pay({ chargeIds: [paid?.id], method: "card" }).expect(409);
    const diegos = (await account("usr_res_diego")).charges[0];
    await pay({ chargeIds: [diegos?.id], method: "card" }).expect(404);
    await pay({ chargeIds: [], method: "card" }).expect(422);
    await pay({ chargeIds: ["chg_001", "chg_001"], method: "card" }).expect(422);
    await pay({ chargeIds: ["chg_001"], method: "crypto" }).expect(422);
  });
});

describe("staff billing", () => {
  const damage = { amountCents: 12500, description: "Replace bent closet track" };

  it("lists the active building's unit balances, most overdue first", async () => {
    const { body: rows } = await api
      .as("coordinator")
      .get("/api/billing/units?buildingId=bld_harbor")
      .expect(200);
    expect(rows.map((row: { unitLabel: string }) => row.unitLabel)).toEqual(["7A", "4B"]);
    expect(rows[0]).toMatchObject({ residentName: "Diego Santillán", overdueCents: 280000 });
    expect(rows[1]).toMatchObject({ balanceCents: 253640, overdueCents: 0, openCount: 2 });
    await api.as("coordinator").get("/api/billing/units?buildingId=bld_maple").expect(404);
    await api.as("usr_coord_theo").get("/api/billing/units?buildingId=bld_harbor").expect(404);
    const { body: linden } = await api
      .as("manager", "bld_linden")
      .get("/api/billing/units")
      .expect(200);
    expect(linden.map((row: { unitLabel: string }) => row.unitLabel)).toEqual(["5D", "12F"]);
  });

  it("lets a coordinator charge a resolved request once", async () => {
    const { body: created } = await api
      .as("coordinator")
      .post("/api/requests/req_004/charges", damage)
      .expect(201);
    expect(created).toMatchObject({
      kind: "damage",
      requestId: "req_004",
      residentId: "usr_res_amara",
      amountCents: 12500,
      paidAt: null,
    });
    const { body: list } = await api
      .as("coordinator")
      .get("/api/requests/req_004/charges")
      .expect(200);
    expect(list.map((charge: Charge) => charge.id)).toEqual([created.id]);
    await api.as("coordinator").post("/api/requests/req_004/charges", damage).expect(409);
    expect((await account()).balanceCents).toBe(253640 + 12500);
  });

  it("guards damage charges by status, role, scope and input", async () => {
    const charge = (who: string, body: object, id = "req_004") =>
      api.as(who).post(`/api/requests/${id}/charges`, body);
    await charge("coordinator", damage, "req_023").expect(409); // not resolved
    await charge("coordinator", { ...damage, amountCents: 50 }).expect(422);
    await charge("coordinator", { ...damage, amountCents: 500001 }).expect(422);
    await charge("coordinator", { ...damage, description: "x" }).expect(422);
    await charge("usr_coord_theo", damage).expect(404);
    await api.as("usr_coord_theo").get("/api/requests/req_004/charges").expect(404);
    await charge("manager", damage).expect(403);
    expect((await api.as("manager").get("/api/requests/req_004/charges").expect(200)).body).toEqual(
      [],
    );
    await charge("resident", damage).expect(403);
    await api.as("resident").get("/api/requests/req_004/charges").expect(403);
    await api.as("usr_res_diego").get("/api/requests/req_004/charges").expect(404);
  });

  it("doesn't shadow the request workflow routes", async () => {
    await api.as("coordinator").post("/api/requests/req_030/triage", {}).expect(200);
  });
});
