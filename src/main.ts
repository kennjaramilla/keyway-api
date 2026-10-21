import { Logger } from "@nestjs/common";
import { createApp } from "./app.factory.js";
import { config } from "./config.js";

const app = await createApp();
await app.listen(config.port);
new Logger("Keyway API").log(`Listening on http://localhost:${config.port}/api`);
