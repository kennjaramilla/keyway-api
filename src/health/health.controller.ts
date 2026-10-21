import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/session.guard.js";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

@Public()
@Controller("health")
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Liveness plus whether MongoDB is connected (readyState 1). */
  @Get()
  check() {
    return { status: "ok", database: this.connection.readyState === 1 ? "up" : "down" };
  }
}
