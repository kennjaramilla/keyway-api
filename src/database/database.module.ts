import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { config } from "../config.js";
import { MODELS } from "./models.js";
import { SeedService } from "./seed.service.js";
import { Store } from "./store.js";

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({ useFactory: () => ({ uri: config.mongoUri }) }),
    MongooseModule.forFeature(
      Object.entries(MODELS).map(([name, schema]) => ({ name, schema, collection: name })),
    ),
  ],
  providers: [Store, SeedService],
  exports: [Store, SeedService],
})
export class DatabaseModule {}
