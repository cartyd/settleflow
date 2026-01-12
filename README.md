# SettleFlow

Trip Settlement Application for Moving Company - TypeScript Monorepo

## Architecture

- **API** (`apps/api`): Fastify + Prisma + SQLite/PostgreSQL
- **Admin UI** (`apps/admin-ui`): Fastify SSR with Nunjucks templates
- **Shared Packages**:
  - `@settleflow/shared-types`: Domain models and API DTOs
  - `@settleflow/shared-validation`: Zod schemas for validation
  - `@settleflow/shared-config`: Environment configuration loader

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

## Quick Start

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development servers (API + Admin UI)
npm run dev
```

The API will be available at http://localhost:3000  
The Admin UI will be available at http://localhost:3001  
API documentation (Swagger) at http://localhost:3000/docs

## Project Structure

```
├── apps/
│   ├── api/                 # Fastify API application
│   │   ├── src/
│   │   │   ├── routes/      # API route handlers
│   │   │   ├── services/    # Business logic
│   │   │   ├── parsers/     # NVL document parsers
│   │   │   └── plugins/     # Fastify plugins
│   │   ├── tests/           # Unit & integration tests
│   │   └── prisma/          # Database schema & migrations
│   └── admin-ui/            # Admin interface
│       ├── src/             # Server code
│       └── views/           # Nunjucks templates
├── packages/
│   ├── shared-types/        # TypeScript types
│   ├── shared-validation/   # Zod validation schemas
│   └── shared-config/       # Configuration management
└── tests/
    └── e2e/                 # End-to-end tests
```

## Development

### Run individual apps

```bash
npm run dev:api      # Start API only
npm run dev:admin    # Start Admin UI only
```

### Database

```bash
npm run prisma:studio    # Open Prisma Studio
npm run prisma:push      # Push schema without migrations
```

### Testing

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e      # E2E tests only
npm run test:watch    # Watch mode
```

### Code Quality

```bash
npm run lint          # Run ESLint
npm run format        # Format code with Prettier
npm run format:check  # Check formatting
```

## Business Rules

### Settlement Batch Constraints

- **One NVL payment = one settlement batch** (enforced via unique constraint)
- NVL payment identified by check number or ACH ID
- Cannot import multiple NVL payments into one batch

### Source of Truth Hierarchy

1. NVL import data (authoritative)
2. Agent-approved adjustments
3. Driver requests (informational only)

### Import Immutability

- NVL import data is write-once
- Updates only via adjustment records
- All changes require audit logging

### Settlement Lifecycle

```
CREATED → IMPORTED → VALIDATED → IMPORT_APPROVED → LOCKED → FUNDS_CLEARED → PAID
```

Status transitions are enforced in code.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
NODE_ENV=development
PORT_API=3000
PORT_ADMIN=3001
DATABASE_URL=file:./dev.db
DATABASE_PROVIDER=sqlite
SENTRY_DSN=
LOG_LEVEL=info
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
CORS_ORIGIN=http://localhost:3001
```

## Production Deployment

```bash
npm run build         # Build all packages
npm run start:api     # Start API in production
npm run start:admin   # Start Admin UI in production
```

For production, set `DATABASE_PROVIDER=postgres` and provide a PostgreSQL connection string.

## API Endpoints

- `GET /health` - Health check
- `GET /docs` - Swagger documentation
- `POST /batches` - Create settlement batch
- `GET /batches` - List batches
- `GET /batches/:id` - Get batch details
- `POST /batches/:id/lock` - Lock batch
- `POST /batches/:id/funds-clear` - Mark funds cleared
- `POST /adjustments` - Create adjustment
- `POST /adjustments/:id/approve` - Approve adjustment

## License

Proprietary
