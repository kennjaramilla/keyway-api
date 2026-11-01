import { Controller, Get, Query } from "@nestjs/common";
import { authorize } from "../auth/authorize.js";
import { CurrentUser } from "../auth/session.guard.js";
import { validationProblem } from "../common/zod.pipe.js";
import { Store } from "../database/store.js";
import { computeDashboard } from "../domain/dashboard/metrics.js";
import { dashboardQuerySchema } from "../domain/dashboard/schema.js";
import type { SessionUser } from "../domain/session/schema.js";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly store: Store) {}

  /** Managers only, across the whole portfolio; metrics come from the shared metrics.ts. */
  @Get()
  async get(@CurrentUser() user: SessionUser, @Query("days") rawDays?: string) {
    authorize(user, "dashboard:view");
    // Validated after the role check, so other roles get 403 whatever they send.
    const query = dashboardQuerySchema.safeParse({ days: rawDays });
    if (!query.success) throw validationProblem(query.error);
    const [requests, buildings, coordinators, vendors] = await Promise.all([
      this.store.find("requests"),
      this.store.find("buildings"),
      this.store.find("users", { role: "coordinator" }),
      this.store.find("vendors"),
    ]);
    return computeDashboard(
      requests,
      buildings,
      coordinators,
      new Date(),
      vendors,
      query.data.days,
    );
  }
}
