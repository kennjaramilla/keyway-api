import { Module } from "@nestjs/common";
import { RulesController } from "./rules.controller.js";

@Module({ controllers: [RulesController] })
export class RulesModule {}
