import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import {
  damageChargeSchema,
  paymentCreateSchema,
  type DamageChargeInput,
  type PaymentCreateInput,
} from "../domain/billing/schema.js";
import type { SessionUser } from "../domain/session/schema.js";
import { BillingService } from "./billing.service.js";

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("billing")
  account(@CurrentUser() user: SessionUser) {
    return this.billing.account(user);
  }

  @Post("billing/payments")
  pay(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(paymentCreateSchema)) input: PaymentCreateInput,
  ) {
    return this.billing.pay(user, input);
  }

  @Get("billing/units")
  units(@CurrentUser() user: SessionUser, @Query("buildingId") buildingId?: string) {
    return this.billing.unitBalances(user, buildingId || undefined);
  }

  @Get("requests/:id/charges")
  charges(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.billing.requestCharges(user, id);
  }

  @Post("requests/:id/charges")
  charge(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(damageChargeSchema)) input: DamageChargeInput,
  ) {
    return this.billing.chargeDamage(user, id, input);
  }
}
