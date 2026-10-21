import { Module } from "@nestjs/common";
import { VendorsController } from "./vendors.controller.js";

@Module({ controllers: [VendorsController] })
export class VendorsModule {}
