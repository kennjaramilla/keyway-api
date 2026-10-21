import { Injectable } from "@nestjs/common";
import { authorize } from "../auth/authorize.js";
import { newId } from "../common/ids.js";
import { conflict, forbidden, notFound } from "../common/problem.js";
import { Store } from "../database/store.js";
import { can } from "../domain/auth/permissions.js";
import {
  chargeStatus,
  DAMAGE_DUE_DAYS,
  type Account,
  type Charge,
  type DamageChargeInput,
  type Payment,
  type PaymentCreateInput,
  type UnitBalance,
} from "../domain/billing/schema.js";
import type { SessionUser } from "../domain/session/schema.js";

const DAY_MS = 86_400_000;
const sum = (charges: readonly Charge[]) =>
  charges.reduce((total, charge) => total + charge.amountCents, 0);
const overdue = (charges: readonly Charge[], now: number) =>
  charges.filter((charge) => chargeStatus(charge, now) === "overdue");

@Injectable()
export class BillingService {
  constructor(private readonly store: Store) {}

  /** The resident's own account: charges newest due first, payments newest first. */
  async account(user: SessionUser, now = Date.now()): Promise<Account> {
    if (user.role !== "resident") throw forbidden();
    authorize(user, "billing:view", { unitId: user.unitId ?? undefined });
    const [charges, payments] = await Promise.all([
      this.store.find("charges", { residentId: user.id, unitId: user.unitId }),
      this.store.find("payments", { residentId: user.id }),
    ]);
    const open = charges.filter((charge) => !charge.paidAt);
    return {
      charges: charges.sort((a, b) => b.dueAt.localeCompare(a.dueAt)),
      payments: payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      balanceCents: sum(open),
      overdueCents: sum(overdue(open, now)),
    };
  }

  /** Pay open charges on the resident's own unit; all of them or none. */
  async pay(user: SessionUser, input: PaymentCreateInput): Promise<Payment> {
    authorize(user, "billing:pay", { unitId: user.unitId ?? undefined });
    const charges = await this.store.find("charges", {
      _id: { $in: input.chargeIds },
      residentId: user.id,
    });
    // Someone else's charge is indistinguishable from a missing one.
    if (charges.length !== input.chargeIds.length) throw notFound("Charge");
    if (charges.some((charge) => charge.paidAt)) {
      throw conflict("ALREADY_PAID", "One of these charges is already paid.");
    }

    const now = new Date().toISOString();
    const payment: Payment = {
      id: newId("pay"),
      reference: `PAY-${2000 + (await this.store.count("payments")) + 1}`,
      buildingId: user.activeBuildingId,
      unitId: user.unitId ?? "",
      residentId: user.id,
      chargeIds: input.chargeIds,
      amountCents: sum(charges),
      method: input.method,
      createdAt: now,
    };
    // Mark paid only if still unpaid, so a double submit can't pay twice.
    const marked = await this.store
      .model("charges")
      .updateMany(
        { _id: { $in: input.chargeIds }, paidAt: null },
        { $set: { paidAt: now, paymentId: payment.id } },
      );
    if (marked.modifiedCount !== input.chargeIds.length) {
      await this.store
        .model("charges")
        .updateMany({ paymentId: payment.id }, { $set: { paidAt: null, paymentId: null } });
      throw conflict("ALREADY_PAID", "One of these charges is already paid.");
    }
    await this.store.insert("payments", [payment]);
    return payment;
  }

  /** Staff: every resident's balance in a building, most overdue first. */
  async unitBalances(user: SessionUser, buildingId = user.activeBuildingId, now = Date.now()) {
    if (user.role === "resident") throw forbidden();
    authorize(user, "billing:view", { buildingId });
    const residents = await this.store.find("users", { role: "resident", buildingIds: buildingId });
    const ids = residents.map((resident) => resident.id);
    const [units, open, payments] = await Promise.all([
      this.store.find("units", { buildingId }),
      this.store.find("charges", { residentId: { $in: ids }, paidAt: null }),
      this.store.find("payments", { residentId: { $in: ids } }),
    ]);
    return residents
      .map((resident): UnitBalance => {
        const mine = open.filter((charge) => charge.residentId === resident.id);
        const last = payments
          .filter((payment) => payment.residentId === resident.id)
          .reduce<string | null>(
            (latest, payment) =>
              !latest || payment.createdAt > latest ? payment.createdAt : latest,
            null,
          );
        return {
          unitId: resident.unitId ?? "",
          unitLabel: units.find((unit) => unit.id === resident.unitId)?.label ?? "—",
          residentId: resident.id,
          residentName: resident.name,
          balanceCents: sum(mine),
          overdueCents: sum(overdue(mine, now)),
          openCount: mine.length,
          lastPaymentAt: last,
        };
      })
      .sort((a, b) => b.overdueCents - a.overdueCents || a.unitLabel.localeCompare(b.unitLabel));
  }

  /** A request in scope for a charge call, else 404 (before any role check). */
  private async request(user: SessionUser, id: string) {
    const request = await this.store.findById("requests", id);
    if (!request || !can(user, "request:view", request)) throw notFound("Request");
    return request;
  }

  async requestCharges(user: SessionUser, requestId: string) {
    const request = await this.request(user, requestId);
    if (user.role === "resident") throw forbidden();
    return this.store.find("charges", { requestId: request.id });
  }

  /** Coordinator bills a resolved request's resident for damage, once. */
  async chargeDamage(user: SessionUser, requestId: string, input: DamageChargeInput) {
    const request = await this.request(user, requestId);
    authorize(user, "charge:create", request);
    if (request.status !== "resolved") {
      throw conflict("NOT_RESOLVED", "Only a resolved request can be charged for.");
    }
    if (await this.store.findOne("charges", { requestId: request.id })) {
      throw conflict("ALREADY_CHARGED", `${request.number} already has a damage charge.`);
    }
    const now = Date.now();
    const charge: Charge = {
      id: newId("chg"),
      buildingId: request.buildingId,
      unitId: request.unitId,
      residentId: request.residentId,
      kind: "damage",
      description: input.description,
      amountCents: input.amountCents,
      dueAt: new Date(now + DAMAGE_DUE_DAYS * DAY_MS).toISOString(),
      createdAt: new Date(now).toISOString(),
      paidAt: null,
      paymentId: null,
      requestId: request.id,
    };
    await this.store.insert("charges", [charge]);
    return charge;
  }
}
