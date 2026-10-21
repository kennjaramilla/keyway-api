import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SessionGuard } from "./auth/session.guard.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { RequestsModule } from "./requests/requests.module.js";
import { SessionModule } from "./session/session.module.js";
import { ThreadsModule } from "./threads/threads.module.js";
import { VendorsModule } from "./vendors/vendors.module.js";

@Module({
  imports: [DatabaseModule, SessionModule, RequestsModule, ThreadsModule, VendorsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
