import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/session.guard.js";
import type { SessionUser } from "../domain/session/schema.js";
import { RequestsService, type WorkflowAction } from "./requests.service.js";

@Controller("requests")
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query("buildingId") buildingId?: string) {
    return this.requests.list(user, buildingId || undefined);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.requests.create(user, body);
  }

  @Get(":id")
  async get(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.requests.detail(await this.requests.findVisible(user, id));
  }

  // One route per step, so other /requests/:id/* routes (billing charges) aren't shadowed.
  @Post(":id/triage") @HttpCode(200) triage(
    @CurrentUser() u: SessionUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.step(u, id, "triage", b);
  }
  @Post(":id/assign") @HttpCode(200) assign(
    @CurrentUser() u: SessionUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.step(u, id, "assign", b);
  }
  @Post(":id/schedule") @HttpCode(200) schedule(
    @CurrentUser() u: SessionUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.step(u, id, "schedule", b);
  }
  @Post(":id/start") @HttpCode(200) start(
    @CurrentUser() u: SessionUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.step(u, id, "start", b);
  }
  @Post(":id/resolve") @HttpCode(200) resolve(
    @CurrentUser() u: SessionUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.step(u, id, "resolve", b);
  }
  @Post(":id/cancel") @HttpCode(200) cancel(
    @CurrentUser() u: SessionUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.step(u, id, "cancel", b);
  }
  @Post(":id/reopen") @HttpCode(200) reopen(
    @CurrentUser() u: SessionUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.step(u, id, "reopen", b);
  }

  private step(user: SessionUser, id: string, action: WorkflowAction, body: unknown) {
    return this.requests.workflow(user, id, action, body);
  }
}
