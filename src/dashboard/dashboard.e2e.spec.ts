import { useApp } from "../../test/app.js";

const api = useApp();

describe("GET /api/dashboard", () => {
  it("returns the seeded portfolio numbers to the manager only", async () => {
    const { body } = await api.as("manager").get("/api/dashboard").expect(200);
    expect(
      body.openByBuilding.map((row: { name: string; open: number }) => [row.name, row.open]),
    ).toEqual([
      ["Harbor View Lofts", 7],
      ["Maple Court", 7],
      ["The Linden", 6],
    ]);
    expect(body.overdueByUrgency).toEqual([
      { urgency: "emergency", overdue: 0 },
      { urgency: "high", overdue: 2 },
      { urgency: "normal", overdue: 1 },
      { urgency: "low", overdue: 1 },
    ]);
    expect(
      body.workload.map((row: { name: string; open: number }) => [row.name, row.open]),
    ).toEqual([
      ["Grace Adeyemi", 14],
      ["Theo Marchetti", 6],
    ]);
    await api.as("coordinator").get("/api/dashboard").expect(403);
    await api.as("resident").get("/api/dashboard").expect(403);
  });
});

describe("GET /api/dashboard?days=", () => {
  it("defaults to 7 days and widens the period and daily series to 14 or 30", async () => {
    const manager = api.as("manager");
    const week = (await manager.get("/api/dashboard").expect(200)).body;
    expect(week.period.days).toBe(7);
    expect(week.daily).toHaveLength(7);
    const fortnight = (await manager.get("/api/dashboard?days=14").expect(200)).body;
    expect(fortnight.period.days).toBe(14);
    expect(fortnight.daily).toHaveLength(14);
    expect(fortnight.period.opened).toBeGreaterThanOrEqual(week.period.opened);
    const month = (await manager.get("/api/dashboard?days=30").expect(200)).body;
    expect(month.daily).toHaveLength(30);
    expect(month.totals).toEqual(week.totals);
  });

  it("rejects other ranges with 422, after the role check", async () => {
    const { body } = await api.as("manager").get("/api/dashboard?days=5").expect(422);
    expect(body.errors).toHaveProperty("days");
    await api.as("manager").get("/api/dashboard?days=").expect(422);
    await api.as("resident").get("/api/dashboard?days=5").expect(403);
  });
});
