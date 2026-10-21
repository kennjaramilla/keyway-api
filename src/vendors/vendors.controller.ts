import { Controller, Get, Query } from "@nestjs/common";
import { authorize } from "../auth/authorize.js";
import { CurrentUser } from "../auth/session.guard.js";
import { Store } from "../database/store.js";
import type { SessionUser } from "../domain/session/schema.js";

@Controller("vendors")
export class VendorsController {
  constructor(private readonly store: Store) {}

  /** Vendors serving the (active) building. */
  @Get()
  list(@CurrentUser() user: SessionUser, @Query("buildingId") buildingId?: string) {
    const building = buildingId || user.activeBuildingId;
    authorize(user, "vendor:list", { buildingId: building });
    return this.store.find("vendors", { buildingIds: building });
  }
}
