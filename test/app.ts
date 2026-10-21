import type { INestApplication } from "@nestjs/common";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

/**
 * One in-memory MongoDB and app per test file. MONGODB_URI is set before the
 * app module is imported, so config.ts picks it up.
 */
export async function startApp() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri("keyway");
  const { createApp } = await import("../src/app.factory.js");
  const app = await createApp();
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    async stop() {
      await app.close();
      await mongo.stop();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof startApp>> & { app: INestApplication };
