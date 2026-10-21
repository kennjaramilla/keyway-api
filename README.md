# Keyway API

The real backend for [Keyway](https://github.com/kennjaramilla/keyway), a property-maintenance demo where residents submit requests, coordinators work them and a manager watches the portfolio. Keyway ships with an in-browser mock API (MSW); this service implements the same contract with NestJS and MongoDB, so the frontend can switch to it with one setting.

Fake data only.

## Stack

NestJS 12 (ESM), TypeScript strict, MongoDB 8 with Mongoose, Zod for request validation, Vitest + Supertest against an in-memory MongoDB, oxlint, Prettier, GitHub Actions and CodeQL. Node 22.

## Run it

```bash
npm install
npm run db:up        # MongoDB in Docker (docker compose), port 27017
cp .env.example .env # optional: PORT and MONGODB_URI
npm run start:dev    # http://localhost:4000/api/health
```

| Command                             | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `npm run start:dev`                 | API on :4000 with watch                                                |
| `npm test` / `npm run test:cov`     | Vitest; each spec file starts its own in-memory MongoDB                |
| `npm run check`                     | lint + format check + typecheck + tests + build. Must pass before a PR |
| `npm run db:up` / `npm run db:down` | Start / stop MongoDB in Docker                                         |

## Shared contract

`src/domain` is copied from the frontend by `npm run sync:domain`: the Zod schemas, `permissions.ts` (the only place access rules live), the status machine and `seed.json`. Don't edit those files here. Change them in Keyway and sync, so the mock API and this API can't drift apart.

An empty database is seeded on start, re-timed so the demo always looks current. `POST /api/demo/reset` re-seeds.

## Layout

```
src/domain/        synced contract (schemas, permissions, seed)
src/database/      Mongoose storage schemas, Store (typed access, id <-> _id), SeedService
src/auth/          SessionGuard (global; @Public() opts out), @CurrentUser, authorize() -> 403/404
src/common/        problem details, ZodPipe (422)
src/<feature>/     controller + service + *.e2e.spec.ts
test/app.ts        useApp(): in-memory MongoDB, re-seed per test, api.as("coordinator")
```

## Endpoints

All under `/api`. `@Public()` routes need no session.

| Area        | Endpoints                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health      | `GET /health` (public)                                                                                                                                        |
| Session     | `GET /demo/people` (public), `GET\|POST\|DELETE /session`, `PUT /session/building`, `POST /demo/reset`                                                        |
| Requests    | `GET /requests?buildingId`, `POST /requests`, `GET /requests/:id`, `POST /requests/:id/{triage,assign,schedule,start,resolve,cancel,reopen}`                  |
| Vendors     | `GET /vendors?buildingId`                                                                                                                                     |
| Messages    | `GET /threads?buildingId`, `POST /threads` (general chat), `GET\|POST /threads/:id/messages`, `POST /threads/:id/read` (`:id` = request id or chat thread id) |
| House rules | `GET /rules?buildingId`                                                                                                                                       |
| Billing     | `GET /billing`, `POST /billing/payments`, `GET /billing/units?buildingId` (staff), `GET\|POST /requests/:id/charges`                                          |
| Dashboard   | `GET /dashboard` (manager)                                                                                                                                    |

## Conventions

- Sessions use the same `keyway_session` cookie as the frontend (`<role>.<userId>.<activeBuildingId>`), now httpOnly. Every request re-checks the user and building against the database, so editing the cookie gains nothing.
- Workflow steps use the shared status machine (`nextStatus`). Each step is one atomic update that also checks the status hasn't changed since it was read, so two people acting at once can't both win.
- Payments mark charges paid with a guarded `updateMany` (`paidAt: null`), so a double submit pays once and the other gets 409.
- The mock API's `?fail=messages` / `?fail=payments` demo toggles are frontend-only and don't exist here.
- Errors are problem details JSON (`{ title, status, detail, code?, errors? }`), the same shape as the mock API.
- `401` no session, `403` wrong role, `404` out of scope (never reveals that something exists), `409` invalid state change, `422` validation.
