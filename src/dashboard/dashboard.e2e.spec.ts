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
