import { useApp } from "../../test/app.js";

const api = useApp();

describe("GET /api/rules", () => {
  it("returns the active building's rules in section order", async () => {
    const { body } = await api.as("resident").get("/api/rules").expect(200);
    expect(body.document.buildingId).toBe("bld_harbor");
    const sections = body.passages.map((passage: { section: string }) => passage.section);
    expect(sections.slice(0, 2)).toEqual(["2.1", "3.1"]);
    expect(sections.indexOf("10.1")).toBeGreaterThan(sections.indexOf("9.1"));
  });

  it("follows the coordinator's active building and hides other buildings", async () => {
    const { body } = await api
      .as("coordinator", "bld_maple")
      .get("/api/rules?buildingId=bld_maple")
      .expect(200);
    expect(body.document.buildingId).toBe("bld_maple");
    await api.as("resident").get("/api/rules?buildingId=bld_linden").expect(404);
    await api.http().get("/api/rules").expect(401);
  });
});
