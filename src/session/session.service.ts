import { Injectable } from "@nestjs/common";
import { Store } from "../database/store.js";
import type { DemoPerson, SessionPayload, SessionUser } from "../domain/session/schema.js";

@Injectable()
export class SessionService {
  constructor(private readonly store: Store) {}

  /** GET /api/session: the user, the buildings they may see and their unit. */
  async payload(user: SessionUser): Promise<SessionPayload> {
    const [buildings, unit] = await Promise.all([
      this.store.find("buildings", { _id: { $in: user.buildingIds } }),
      user.unitId ? this.store.findById("units", user.unitId) : null,
    ]);
    const order = (id: string) => user.buildingIds.indexOf(id);
    return { user, buildings: buildings.sort((a, b) => order(a.id) - order(b.id)), unit };
  }

  /** Everyone the demo sign-in page offers, with where they live or work. */
  async people(): Promise<DemoPerson[]> {
    const [users, buildings, units] = await Promise.all([
      this.store.find("users"),
      this.store.find("buildings"),
      this.store.find("units"),
    ]);
    const buildingName = (id: string) => buildings.find((b) => b.id === id)?.name ?? id;
    return users.map((user) => {
      const unit = units.find((u) => u.id === user.unitId);
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        context: unit
          ? `${buildingName(unit.buildingId)} · ${unit.label}`
          : user.role === "manager"
            ? "All buildings"
            : user.buildingIds.map(buildingName).join(", "),
      };
    });
  }
}
