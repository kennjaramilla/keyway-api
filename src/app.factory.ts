import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { ProblemFilter } from "./common/problem.filter.js";

/** Builds the app the same way for main.ts and the tests. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn"],
  });
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
