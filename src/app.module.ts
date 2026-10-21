import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { config } from "./config.js";
import { HealthController } from "./health/health.controller.js";

@Module({
  imports: [MongooseModule.forRootAsync({ useFactory: () => ({ uri: config.mongoUri }) })],
  controllers: [HealthController],
})
export class AppModule {}
