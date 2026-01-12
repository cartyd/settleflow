
# Claude Sonnet 4.5 Prompt

## Scaffold a TypeScript Monorepo Trip Settlement Application (API + UI)

---

## SYSTEM ROLE

You are a **principal software architect** responsible for scaffolding a **production-grade monorepo** for a **Trip Settlement application** used by a moving company.

The system consists of:

1. **API application** (Fastify + Prisma)
2. **Admin UI application** (Server-rendered Nunjucks)
3. **Shared packages** (types, validation, config)

You must generate **real, runnable code**.
If logic is incomplete, create **working stubs with types and tests**.
No TODO-only placeholders are allowed.

---

## 1. Monorepo structure (MANDATORY)

Use **npm workspaces** (not pnpm, not yarn).

```
/apps
  /api
    src/
    tests/
    prisma/
    package.json
    tsconfig.json

  /admin-ui
    src/
    views/
    tests/
    package.json
    tsconfig.json

/packages
  /shared-types
  /shared-validation
  /shared-config

/tests
  /e2e

.env.example
package.json
tsconfig.base.json
README.md
```

---

## 2. Technology stack (locked)

### Backend API (`apps/api`)

* Node.js (LTS)
* TypeScript
* Fastify
* Prisma ORM
* SQLite (development)
* PostgreSQL (production)
* Vitest (unit + integration)
* Supertest
* Zod
* Helmet
* Pino
* Sentry
* Fastify Swagger
* Fastify Rate Limit
* Fastify Env

### Admin UI (`apps/admin-ui`)

* Node.js + TypeScript
* Fastify (SSR server)
* Nunjucks
* Shared types from `/packages`
* Vitest for UI route tests

### Shared packages

* `shared-types`: domain & API DTOs
* `shared-validation`: Zod schemas
* `shared-config`: typed env loading

❌ Do not use:

* Docker
* Frontend frameworks (React, Vue, etc.)
* In-memory databases

---

## 3. Business rules (must be enforced in code)

### 3.1 Settlement batch constraint (hard rule)

> **One NVL payment = one settlement batch**

* NVL payment = check number OR ACH id
* Unique per agency
* Cannot import data from multiple NVL payments into one batch

**Implementation**

* Prisma unique constraint `(agencyId, nvlPaymentRef)`
* Service-layer guard

---

### 3.2 Source of truth hierarchy

1. NVL import data (authoritative)
2. Agent-approved adjustments
3. Driver requests (informational only)

Driver requests not present in NVL:

* Remain `PENDING`
* Not deducted
* Flagged for review

---

### 3.3 Import immutability

* NVL import tables are **write-once**
* No updates allowed
* Adjustments:

  * Reference original record
  * Include reason
  * Require approval
* Audit log required for:

  * Import approval
  * Adjustment approval
  * Batch locking
  * Funds cleared

---

### 3.4 Settlement lifecycle states

Implement explicit status enums and guards:

1. CREATED
2. IMPORTED
3. VALIDATED
4. IMPORT_APPROVED
5. LOCKED
6. FUNDS_CLEARED
7. PAID

Invalid transitions must throw errors.

---

## 4. Prisma schema (REQUIRED)

Located in `apps/api/prisma/schema.prisma`

Models must include:

* Agency
* Driver
* SettlementBatch
* ImportFile
* ImportDocument
* ImportLine
* RevenueDistribution
* Advance
* Deduction
* DriverRequest
* Adjustment
* AuditLog

Rules:

* Imported rows immutable
* Adjustments reference:

  * table
  * record id
  * field
  * original value
  * adjusted value
* Audit logs store before/after snapshots

---

## 5. API routes (Fastify + Zod + Swagger)

### Core endpoints

```
GET    /health
GET    /docs

POST   /batches
GET    /batches
GET    /batches/:id
POST   /batches/:id/imports
POST   /batches/:id/imports/:importId/approve
POST   /batches/:id/lock
POST   /batches/:id/funds-clear
GET    /batches/:id/preview

POST   /batches/:id/adjustments
POST   /adjustments/:id/approve
GET    /batches/:id/audit
```

Requirements:

* Zod validation on every route
* Swagger auto-generation
* Pino logging per request
* Sentry error capture

---

## 6. NVL parsing module (structured stubs)

Location: `apps/api/src/parsers/nvl`

```
detectDocumentType.ts
extractText.ts
parseRemittance.ts
parseSettlementDetail.ts
parseRevenueDistribution.ts
parseAdvanceAdvice.ts
parseCreditDebit.ts
```

Pipeline:

1. Extract text (stub)
2. Detect document type
3. Parse into typed objects
4. Normalize into ImportLine records

---

## 7. Admin UI (Nunjucks SSR)

Location: `apps/admin-ui`

Required routes:

```
/admin/batches
/admin/batches/:id
/admin/batches/:id/import
/admin/batches/:id/import-review
/admin/batches/:id/preview
/admin/batches/:id/audit
```

Rules:

* Server-rendered only
* No JS frameworks
* Uses shared types
* Calls API via internal HTTP client

---

## 8. Environment configuration

`.env.example` (root):

```
NODE_ENV=
PORT_API=
PORT_ADMIN=
DATABASE_URL=
DATABASE_PROVIDER=sqlite|postgres
SENTRY_DSN=
LOG_LEVEL=
RATE_LIMIT_MAX=
RATE_LIMIT_WINDOW=
CORS_ORIGIN=
```

* Shared config loader in `/packages/shared-config`
* Fail fast in production

---

## 9. Testing strategy (Vitest only)

### Unit tests

`apps/api/tests/unit`

* Batch uniqueness
* Status transitions
* Adjustment immutability
* Effective value calculation
* NVL doc detection

### Integration tests

`apps/api/tests/integration`

* Prisma + services
* Import → approve → lock flow
* Validation errors

### API e2e tests

`/tests/e2e`

* Boot API
* HTTP requests via Supertest
* Real SQLite test DB

### Admin UI tests

`apps/admin-ui/tests`

* Route rendering
* Error states
* API client mocking

Rules:

* No shared DB between test layers
* Deterministic fixtures
* DB reset per test suite

---

## 10. Root & workspace scripts (MANDATORY)

### Root `package.json`

```
dev
build
lint
format
test
test:unit
test:integration
test:e2e
```

### API app scripts

```
dev
build
start
test
prisma:migrate
prisma:generate
```

### Admin UI scripts

```
dev
build
start
test
```

---

## 11. Observability & logging

* Pino:

  * request id
  * response time
  * errors
* Sentry:

  * Fastify plugin
  * request context
  * unhandled errors

---

## 12. Definition of done (Claude must satisfy)

The scaffold is complete when:

* `npm install && npm run dev` runs API + UI
* Prisma migrations run (SQLite)
* Swagger UI loads
* Admin pages render real data
* Vitest tests pass (all layers)
* No Docker files exist
* No missing files
* No TODO-only placeholders

---

## 13. Output format (IMPORTANT)

Claude must output:

1. Full monorepo file tree
2. Full contents of:

   * Root `package.json`
   * `apps/api/package.json`
   * `apps/admin-ui/package.json`
   * `prisma/schema.prisma`
   * One API route
   * One service
   * One parser
   * One test per test layer
3. Abbreviated but valid contents for remaining files
4. A working README with setup instructions



