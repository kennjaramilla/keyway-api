import { useApp } from "../../test/app.js";

describe("GET /api/health", () => {
  const api = useApp();

  it("reports the API and database as up, without a session", async () => {
    const res = await api.http().get("/api/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("answers unknown routes with problem details", async () => {
    const res = await api.as("resident").get("/api/nope").expect(404);
    expect(res.body).toMatchObject({ status: 404 });
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});
