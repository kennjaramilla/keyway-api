import { Body, Controller, Delete, Get, HttpCode, Post, Put, Res } from "@nestjs/common";
import type { Response } from "express";
import { authorize } from "../auth/authorize.js";
import { clearSession, writeSession } from "../auth/session-cookie.js";
import { CurrentUser, Public } from "../auth/session.guard.js";
import { notFound } from "../common/problem.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { SeedService } from "../database/seed.service.js";
import { Store } from "../database/store.js";
import { signInSchema, switchBuildingSchema, type SessionUser } from "../domain/session/schema.js";
import { SessionService } from "./session.service.js";

@Controller()
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly store: Store,
    private readonly seed: SeedService,
  ) {}

  @Public()
  @Get("demo/people")
  people() {
    return this.sessions.people();
  }

  @Get("session")
  current(@CurrentUser() user: SessionUser) {
    return this.sessions.payload(user);
  }

  /** Demo sign-in: pick a seeded person; their first building becomes active. */
  @Public()
  @Post("session")
  @HttpCode(200)
  async signIn(
    @Body(new ZodPipe(signInSchema)) { userId }: { userId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.store.findById("users", userId);
    if (!user) throw notFound("Person");
    const activeBuildingId = user.buildingIds[0];
    if (!activeBuildingId) throw notFound("Building");
    writeSession(res, { role: user.role, userId: user.id, activeBuildingId });
    return this.sessions.payload({ ...user, activeBuildingId });
  }

  @Public()
  @Delete("session")
  @HttpCode(204)
  signOut(@Res({ passthrough: true }) res: Response) {
    clearSession(res);
  }

  @Put("session/building")
  async switchBuilding(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(switchBuildingSchema)) { buildingId }: { buildingId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    authorize(user, "building:switch", { buildingId });
    writeSession(res, { role: user.role, userId: user.id, activeBuildingId: buildingId });
    return this.sessions.payload({ ...user, activeBuildingId: buildingId });
  }

  /** Re-seed everything (the "Reset demo data" menu item). */
  @Public()
  @Post("demo/reset")
  @HttpCode(204)
  async reset() {
    await this.seed.reset();
  }
}
