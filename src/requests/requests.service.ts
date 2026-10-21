import { Injectable } from "@nestjs/common";
import { authorize } from "../auth/authorize.js";
import { conflict, notFound, Problem } from "../common/problem.js";
import { newId } from "../common/ids.js";
import { validationProblem } from "../common/zod.pipe.js";
import { Store } from "../database/store.js";
import { can, type Action } from "../domain/auth/permissions.js";
import {
  assignSchema,
  canStillReopen,
  cancelSchema,
  makeRequestCreateSchema,
  makeScheduleSchema,
  nextStatus,
  reopenSchema,
  resolveSchema,
  triageSchema,
  type MaintenanceRequest,
  type TimelineEvent,
} from "../domain/requests/schema.js";
import { localDate } from "../domain/requests/time.js";
import type { SessionUser } from "../domain/session/schema.js";
import type { z } from "zod";

export const WORKFLOW_ACTIONS = [
  "triage",
  "assign",
  "schedule",
  "start",
  "resolve",
  "cancel",
  "reopen",
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

const parse = <S extends z.ZodType>(schema: S, body: unknown): z.infer<S> => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw validationProblem(parsed.error);
  return parsed.data;
};

const invalidTransition = (request: MaintenanceRequest, verb: string) =>
  conflict("INVALID_TRANSITION", `${request.number} can't be ${verb} from its current status.`);

@Injectable()
export class RequestsService {
  constructor(private readonly store: Store) {}

  /** Residents: own unit. Coordinators: the active building only. Managers: any building. */
  async list(user: SessionUser, buildingId = user.activeBuildingId) {
    authorize(user, "request:list", user.role === "resident" ? {} : { buildingId });
    const requests = await this.store.find(
      "requests",
      user.role === "resident" ? { unitId: user.unitId } : { buildingId },
    );
    const [units, vendors] = await Promise.all([
      this.store.find("units", { _id: { $in: [...new Set(requests.map((r) => r.unitId))] } }),
      this.store.find("vendors"),
    ]);
    return requests
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => ({
        ...request,
        unitLabel: units.find((unit) => unit.id === request.unitId)?.label ?? "",
        vendorName: vendors.find((vendor) => vendor.id === request.vendorId)?.name ?? null,
      }));
  }

  /** A request the user may view, or 404 (out of scope never reveals that it exists). */
  async findVisible(user: SessionUser, id: string) {
    const request = await this.store.findById("requests", id);
    if (!request || !can(user, "request:view", request)) throw notFound("Request");
    return request;
  }

  async detail(request: MaintenanceRequest) {
    const [unit, building, users, vendors] = await Promise.all([
      this.store.findById("units", request.unitId),
      this.store.findById("buildings", request.buildingId),
      this.store.find("users"),
      this.store.find("vendors"),
    ]);
    const vendor = vendors.find((item) => item.id === request.vendorId);
    return {
      ...request,
      unitLabel: unit?.label ?? "",
      vendorName: vendor?.name ?? null,
      buildingName: building?.name ?? "",
      timeZone: building?.timezone ?? "UTC",
      vendor: vendor
        ? { id: vendor.id, name: vendor.name, trade: vendor.trade, phone: vendor.phone }
        : null,
      people: Object.fromEntries(
        [...users, ...vendors].map((person) => [person.id, person.name] as const),
      ),
    };
  }

  /** Residents only; unit, building and people come from the session, never the body. */
  async create(user: SessionUser, body: unknown) {
    authorize(user, "request:create");
    const building = await this.store.findById("buildings", user.activeBuildingId);
    if (!building || !user.unitId) throw notFound("Unit");
    const input = parse(makeRequestCreateSchema(localDate(new Date(), building.timezone)), body);

    const latest = await this.store.model("requests").findOne().sort({ number: -1 }).lean<{
      number: string;
    }>();
    const now = new Date().toISOString();
    const created: MaintenanceRequest = {
      ...input,
      id: newId("req"),
      number: `KW-${Math.max(1000, Number(latest?.number.slice(3) ?? 0)) + 1}`,
      buildingId: building.id,
      unitId: user.unitId,
      residentId: user.id,
      coordinatorId: building.coordinatorIds[0] ?? "",
      vendorId: null,
      status: "new",
      entryNotes: input.entryNotes || null,
      visitWindow: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      timeline: [{ id: newId("evt"), type: "created", at: now, actorId: user.id, toStatus: "new" }],
    };
    await this.store.insert("requests", [created]);
    return this.detail(created);
  }

  /** Apply a workflow step: role and scope, then the status machine, then the body. */
  async workflow(user: SessionUser, id: string, action: WorkflowAction, body: unknown) {
    const found = await this.findVisible(user, id);
    authorize(user, `request:${action}` as Action, found);
    const record = (
      event: Omit<TimelineEvent, "id" | "at" | "fromStatus" | "toStatus">,
      to = found.status,
      changes: Partial<MaintenanceRequest> = {},
    ) => this.record(found, event, to, changes);

    switch (action) {
      case "triage": {
        const next = nextStatus(found.status, "request:triage");
        if (!next) throw invalidTransition(found, "triaged");
        const { note, category, urgency } = parse(triageSchema, body ?? {});
        const changes = { ...(category && { category }), ...(urgency && { urgency }) };
        return record({ type: "triaged", actorId: user.id, note: note || null }, next, changes);
      }
      case "assign": {
        if (found.status !== "triaged" && found.status !== "scheduled") {
          throw invalidTransition(found, "assigned");
        }
        const { vendorId } = parse(assignSchema, body);
        const vendor = await this.store.findOne("vendors", {
          _id: vendorId,
          buildingIds: found.buildingId,
        });
        if (!vendor) {
          throw new Problem(422, "Validation failed", "Some fields need attention.", {
            errors: { vendorId: ["Choose a vendor who serves this building."] },
          });
        }
        return record(
          { type: "vendor_assigned", actorId: user.id, meta: { vendorId: vendor.id } },
          found.status,
          { vendorId: vendor.id },
        );
      }
      case "schedule": {
        const next = nextStatus(found.status, "request:schedule");
        if (!next) throw invalidTransition(found, "scheduled");
        if (!found.vendorId) throw conflict("VENDOR_REQUIRED", "Assign a vendor first.");
        const building = await this.store.findById("buildings", found.buildingId);
        const visitWindow = parse(
          makeScheduleSchema({
            now: new Date(),
            timeZone: building?.timezone ?? "UTC",
            urgency: found.urgency,
          }),
          body,
        );
        const type = found.status === "scheduled" ? "rescheduled" : "scheduled";
        return record({ type, actorId: user.id, meta: { visitWindow } }, next, { visitWindow });
      }
      case "start": {
        const next = nextStatus(found.status, "request:start");
        if (!next) throw invalidTransition(found, "started");
        return record({ type: "started", actorId: user.id }, next);
      }
      case "resolve": {
        const next = nextStatus(found.status, "request:resolve");
        if (!next) throw invalidTransition(found, "resolved");
        const { resolutionNote } = parse(resolveSchema, body);
        return record({ type: "resolved", actorId: user.id, note: resolutionNote }, next, {
          resolvedAt: new Date().toISOString(),
        });
      }
      case "cancel": {
        const next = nextStatus(found.status, "request:cancel");
        if (!next) throw invalidTransition(found, "cancelled");
        const { reason } = parse(cancelSchema, body ?? {});
        return record({ type: "cancelled", actorId: user.id, note: reason || null }, next);
      }
      case "reopen": {
        const next = nextStatus(found.status, "request:reopen");
        if (!next) throw invalidTransition(found, "reopened");
        if (!canStillReopen(found)) {
          throw conflict(
            "REOPEN_WINDOW_CLOSED",
            "Requests can only be reopened within 7 days of being resolved.",
          );
        }
        const { reason } = parse(reopenSchema, body);
        return record({ type: "reopened", actorId: user.id, note: reason }, next, {
          resolvedAt: null,
        });
      }
    }
  }

  /** Change status (or not) and append the timeline event in one atomic update. */
  private async record(
    request: MaintenanceRequest,
    event: Omit<TimelineEvent, "id" | "at" | "fromStatus" | "toStatus">,
    to: MaintenanceRequest["status"],
    changes: Partial<MaintenanceRequest>,
  ) {
    const at = new Date().toISOString();
    const updated = await this.store
      .model("requests")
      .findOneAndUpdate(
        // Guard against a concurrent step: only apply if the status hasn't moved.
        { _id: request.id, status: request.status },
        {
          $set: { ...changes, status: to, updatedAt: at },
          $push: {
            timeline: { id: newId("evt"), at, fromStatus: request.status, toStatus: to, ...event },
          },
        },
        { new: true },
      )
      .lean<{ _id: string }>();
    if (!updated) throw invalidTransition(request, "changed");
    const { _id, ...rest } = updated;
    return this.detail({ id: _id, ...rest } as unknown as MaintenanceRequest);
  }
}
