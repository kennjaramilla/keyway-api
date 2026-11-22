import { Module } from "@nestjs/common";
import { BuildingsController } from "./buildings.controller.js";

@Module({ controllers: [BuildingsController] })
export class BuildingsModule {}
