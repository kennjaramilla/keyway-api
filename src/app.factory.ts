import type { INestApplication, LogLevel } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import { AppModule } from "./app.module.js";
import { ProblemFilter } from "./common/problem.filter.js";

/** Malformed JSON is a validation error (422), the same as the mock API. */
const jsonErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if ((error as { type?: string }).type !== "entity.parse.failed") return next(error);
  res.status(422).json({
    title: "Validation failed",
    status: 422,
    detail: "The request body isn't valid JSON.",
    errors: { _: ["Send a JSON body."] },
  });
};

/** Builds the app the same way for main.ts and the tests. */
export async function createApp(logger: LogLevel[] = ["error", "warn"]): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger,
  });
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(express.json({ limit: "100kb" }), jsonErrors, cookieParser());
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
