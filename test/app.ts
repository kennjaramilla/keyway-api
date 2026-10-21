import type { INestApplication } from "@nestjs/common";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { SeedService } from "../src/database/seed.service.js";
import {
  DEMO_USER_IDS,
  SESSION_COOKIE,
  encodeSession,
  type Role,
} from "../src/domain/auth/demo-users.js";
import { createSeed } from "../src/domain/seed/seed.js";

const seedUsers = createSeed().users;

/** A Cookie header for a seeded person (role name or user id), like cy.signInAs. */
export function cookieFor(who: Role | string, activeBuildingId?: string) {
  const userId = DEMO_USER_IDS[who as Role] ?? who;
  const user = seedUsers.find((candidate) => candidate.id === userId);
  if (!user) throw new Error(`No seeded user ${userId}`);
  const buildingId = activeBuildingId ?? user.buildingIds[0] ?? "";
  return `${SESSION_COOKIE}=${encodeURIComponent(
    encodeSession({ role: user.role, userId, activeBuildingId: buildingId }),
  )}`;
}

/**
 * One in-memory MongoDB and app per spec file, re-seeded before each test.
 * MONGODB_URI is set before the app module is imported, so config.ts picks it up.
 */
export function useApp() {
  const ctx = {} as {
    app: INestApplication;
    mongo: MongoMemoryServer;
    seed: SeedService;
  };

  beforeAll(async () => {
    ctx.mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = ctx.mongo.getUri("keyway");
    const { createApp } = await import("../src/app.factory.js");
    const { SeedService } = await import("../src/database/seed.service.js");
    ctx.app = await createApp();
    await ctx.app.init();
    ctx.seed = ctx.app.get(SeedService);
  });
  beforeEach(() => ctx.seed.reset());
  afterAll(async () => {
    await ctx.app?.close();
    await ctx.mongo?.stop();
  });

  const http = () => request(ctx.app.getHttpServer());
  return {
    http,
    get app() {
      return ctx.app;
    },
    /** Requests as a seeded person: api.as("coordinator").get("/api/session") */
    as(who: Role | string, buildingId?: string) {
      const cookie = cookieFor(who, buildingId);
      return {
        get: (url: string) => http().get(url).set("Cookie", cookie),
        post: (url: string, body?: object) => http().post(url).set("Cookie", cookie).send(body),
        put: (url: string, body?: object) => http().put(url).set("Cookie", cookie).send(body),
        delete: (url: string) => http().delete(url).set("Cookie", cookie),
      };
    },
  };
}
