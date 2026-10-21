// Copies Keyway's shared contract (Zod schemas, permission rules, seed) into src/domain.
// Run from this repo with the frontend checked out next to it: npm run sync:domain
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const FRONTEND = process.env.KEYWAY_DIR ?? "../keyway";
const OUT = "src/domain";

/** frontend path (under src/) -> domain path */
const FILES = {
  "lib/auth/permissions.ts": "auth/permissions.ts",
  "lib/auth/demo-users.ts": "auth/demo-users.ts",
  "features/billing/schema.ts": "billing/schema.ts",
  "features/buildings/schema.ts": "buildings/schema.ts",
  "features/dashboard/schema.ts": "dashboard/schema.ts",
  "features/dashboard/metrics.ts": "dashboard/metrics.ts",
  "features/house-rules/schema.ts": "house-rules/schema.ts",
  "features/messages/schema.ts": "messages/schema.ts",
  "features/messages/unread.ts": "messages/unread.ts",
  "features/requests/schema.ts": "requests/schema.ts",
  "features/requests/time.ts": "requests/time.ts",
  "features/session/schema.ts": "session/schema.ts",
  "features/vendors/schema.ts": "vendors/schema.ts",
};

const target = (from) => FILES[from] ?? null;

for (const [from, to] of Object.entries(FILES)) {
  const source = readFileSync(join(FRONTEND, "src", from), "utf8");
  const rewritten = source.replace(/from "([^"]+)"/g, (match, spec) => {
    let resolved = null;
    if (spec.startsWith("@/")) resolved = target(`${spec.slice(2)}.ts`);
    else if (spec.startsWith(".")) resolved = target(join(dirname(from), `${spec}.ts`));
    else return match;
    if (!resolved) throw new Error(`${from} imports ${spec}, which isn't synced`);
    let path = relative(dirname(to), resolved).replace(/\.ts$/, ".js");
    if (!path.startsWith(".")) path = `./${path}`;
    return `from "${path}"`;
  });
  const out = join(OUT, to);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `// Synced from keyway/src/${from} by \`npm run sync:domain\`. Edit it there, not here.\n${rewritten}`,
  );
}

mkdirSync(join(OUT, "seed"), { recursive: true });
writeFileSync(
  join(OUT, "seed/seed.json"),
  readFileSync(join(FRONTEND, "src/mocks/seed.json"), "utf8"),
);
console.log(`Synced ${Object.keys(FILES).length} files and seed.json from ${FRONTEND}`);
