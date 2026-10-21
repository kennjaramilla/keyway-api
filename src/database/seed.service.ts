import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { createSeed } from "../domain/seed/seed.js";
import { MODELS, type CollectionName } from "./models.js";
import { Store } from "./store.js";

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly store: Store) {}

  /** An empty database gets the demo data on start. */
  async onApplicationBootstrap() {
    if ((await this.store.count("users")) === 0) {
      await this.reset();
      this.logger.log("Seeded the demo data");
    }
  }

  /** Replace everything with a fresh seed re-timed to `now`. */
  async reset(now?: number) {
    const seed = createSeed(now);
    await this.store.clear();
    for (const name of Object.keys(MODELS) as CollectionName[]) {
      await this.store.insert(name, seed[name]);
    }
  }
}
