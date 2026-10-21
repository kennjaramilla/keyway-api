import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SessionGuard } from "./auth/session.guard.js";
import { BillingModule } from "./billing/billing.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { RequestsModule } from "./requests/requests.module.js";
import { RulesModule } from "./rules/rules.module.js";
import { SessionModule } from "./session/session.module.js";
import { ThreadsModule } from "./threads/threads.module.js";
import { VendorsModule } from "./vendors/vendors.module.js";

@Module({
  imports: [
    DatabaseModule,
    SessionModule,
    RequestsModule,
    ThreadsModule,
    VendorsModule,
    RulesModule,
    BillingModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
