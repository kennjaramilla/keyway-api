import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import {
  chatCreateSchema,
  messageCreateSchema,
  type ChatCreateInput,
} from "../domain/messages/schema.js";
import type { SessionUser } from "../domain/session/schema.js";
import { ThreadsService } from "./threads.service.js";

/** `:id` is a request id (request thread) or a general chat's thread id. */
@Controller("threads")
export class ThreadsController {
  constructor(private readonly threads: ThreadsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query("buildingId") buildingId?: string) {
    return this.threads.list(user, buildingId || undefined);
  }

  @Post()
  start(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(chatCreateSchema)) input: ChatCreateInput,
  ) {
    return this.threads.startChat(user, input);
  }

  @Get(":id/messages")
  messages(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.threads.detail(user, id);
  }

  @Post(":id/messages")
  send(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(messageCreateSchema)) { body }: { body: string },
  ) {
    return this.threads.send(user, id, body);
  }

  @Post(":id/read")
  @HttpCode(204)
  read(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.threads.markRead(user, id);
  }
}
