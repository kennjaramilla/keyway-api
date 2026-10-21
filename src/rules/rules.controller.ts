import { Controller, Get, Query } from "@nestjs/common";
import { authorize } from "../auth/authorize.js";
import { CurrentUser } from "../auth/session.guard.js";
import { notFound } from "../common/problem.js";
import { Store } from "../database/store.js";
import { compareSections } from "../domain/house-rules/schema.js";
import type { SessionUser } from "../domain/session/schema.js";

@Controller("rules")
export class RulesController {
  constructor(private readonly store: Store) {}

  /** The building's house rules, in section order (2.1 before 10.1). */
  @Get()
  async get(@CurrentUser() user: SessionUser, @Query("buildingId") buildingId?: string) {
    const building = buildingId || user.activeBuildingId;
    authorize(user, "rules:view", { buildingId: building });
    const document = await this.store.findOne("ruleDocuments", { buildingId: building });
    if (!document) throw notFound("Rules");
    const passages = await this.store.find("rulePassages", { documentId: document.id });
    return { document, passages: passages.sort((a, b) => compareSections(a.section, b.section)) };
  }
}
