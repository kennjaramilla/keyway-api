import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection, Model } from "mongoose";
import type { Db } from "../domain/seed/seed.js";
import { MODELS, type CollectionName } from "./models.js";

/** The domain type stored in each collection. */
export type Entity<C extends CollectionName> = Db[C][number];
type Filter = Record<string, unknown>;

const toEntity = <C extends CollectionName>({ _id, ...rest }: { _id: string }) =>
  ({ id: _id, ...rest }) as Entity<C>;
const toDoc = ({ id, ...rest }: { id: string }) => ({ _id: id, ...rest });

/**
 * Typed access to MongoDB in domain shapes (`id`, not `_id`), so services and
 * the shared Zod schemas never see storage details.
 */
@Injectable()
export class Store {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  model(name: CollectionName): Model<{ _id: string }> {
    return this.connection.model<{ _id: string }>(name);
  }

  async find<C extends CollectionName>(name: C, filter: Filter = {}): Promise<Entity<C>[]> {
    const docs = await this.model(name).find(filter).lean<{ _id: string }[]>();
    return docs.map((doc) => toEntity<C>(doc));
  }

  async findOne<C extends CollectionName>(name: C, filter: Filter): Promise<Entity<C> | null> {
    const doc = await this.model(name).findOne(filter).lean<{ _id: string }>();
    return doc ? toEntity<C>(doc) : null;
  }

  findById<C extends CollectionName>(name: C, id: unknown) {
    return typeof id === "string" ? this.findOne(name, { _id: id }) : Promise.resolve(null);
  }

  count(name: CollectionName, filter: Filter = {}) {
    return this.model(name).countDocuments(filter);
  }

  async insert<C extends CollectionName>(name: C, entities: Entity<C>[]) {
    if (entities.length) await this.model(name).insertMany(entities.map(toDoc));
  }

  /** Set fields on one document; returns the updated entity. */
  async update<C extends CollectionName>(name: C, id: string, set: Partial<Entity<C>>) {
    const doc = await this.model(name)
      .findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" })
      .lean<{ _id: string }>();
    return doc ? toEntity<C>(doc) : null;
  }

  async clear() {
    await Promise.all(
      (Object.keys(MODELS) as CollectionName[]).map((name) => this.model(name).deleteMany({})),
    );
  }
}
