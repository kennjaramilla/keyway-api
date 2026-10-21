import { startApp, type TestApp } from "../../test/app.js";

describe("GET /api/health", () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await startApp();
  });
  afterAll(() => ctx.stop());

  it("reports the API and database as up", async () => {
    const res = await ctx.http().get("/api/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("answers unknown routes with problem details", async () => {
    const res = await ctx.http().get("/api/nope").expect(404);
    expect(res.body).toMatchObject({ status: 404 });
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});
