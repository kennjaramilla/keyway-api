import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { authorize } from "../auth/authorize.js";
import { CurrentUser } from "../auth/session.guard.js";
import { conflict, notFound } from "../common/problem.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { Store } from "../database/store.js";
import {
  reassignCoordinatorSchema,
  reassignmentConflict,
  type ReassignCoordinatorInput,
} from "../domain/buildings/schema.js";
import { OPEN_STATUSES } from "../domain/requests/schema.js";
import type { SessionUser } from "../domain/session/schema.js";

@Controller("buildings")
export class BuildingsController {
  constructor(private readonly store: Store) {}

  /** Which coordinator covers which building. Manager only. */
  @Get("coverage")
  async coverage(@CurrentUser() user: SessionUser) {
    authorize(user, "building:assign-coordinator");
    return this.readCoverage();
  }

  /** Hands a building from one coordinator to another; its open requests move too. */
  @Post(":id/coordinator")
  @HttpCode(200)
  async reassign(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(reassignCoordinatorSchema)) { fromId, toId }: ReassignCoordinatorInput,
  ) {
    authorize(user, "building:assign-coordinator");
    const building = await this.store.findById("buildings", id);
    if (!building) throw notFound("Building");
    const [from, to] = await Promise.all([
      this.store.findOne("users", { _id: fromId, role: "coordinator" }),
      this.store.findOne("users", { _id: toId, role: "coordinator" }),
    ]);
    if (!from || !to) throw notFound("Coordinator");
    const blocked = reassignmentConflict(building, from, to);
    if (blocked) throw conflict(blocked.code, blocked.detail);

    await this.store.update("buildings", id, {
      coordinatorIds: building.coordinatorIds.map((current) =>
        current === fromId ? toId : current,
      ),
    });
    await Promise.all([
      this.store.update("users", fromId, { buildingIds: from.buildingIds.filter((b) => b !== id) }),
      this.store.update("users", toId, { buildingIds: [...to.buildingIds, id] }),
      this.store
        .model("requests")
        .updateMany(
          { buildingId: id, coordinatorId: fromId, status: { $in: OPEN_STATUSES } },
          { $set: { coordinatorId: toId } },
        ),
    ]);
    return this.readCoverage();
  }

  private async readCoverage() {
    const [buildings, coordinators] = await Promise.all([
      this.store.find("buildings"),
      this.store.find("users", { role: "coordinator" }),
    ]);
    return {
      buildings: buildings.map(({ id, name, coordinatorIds }) => ({ id, name, coordinatorIds })),
      coordinators: coordinators.map(({ id, name }) => ({ id, name })),
    };
  }
}
