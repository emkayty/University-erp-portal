# UniPortal ERP

> Production-grade University Enterprise Resource Planning — Nigerian Edition  
> **Version:** Post-Phase-10 — production integrity hardening (see docs/CHANGELOG.md for change history)  
> **Spec:** v5.0 (Critical Evaluation fixes applied — June 2026)

---

## Architecture

```
Turborepo Monorepo (pnpm workspaces)
├── apps/api          NestJS 11 — Modular Monolith backend
├── apps/web          Next.js 15 App Router frontend
├── packages/types    Shared TypeScript contracts
├── packages/config   Zod env validation + feature flags
├── packages/utils    Encryption (AES-256-GCM + key versioning), CGPA, currency
└── packages/prisma-client  PrismaClient re-export wrapper
```

**Stack:** NestJS · Next.js 15 · PostgreSQL 16 · Prisma 6 · Redis 7 · BullMQ · TailwindCSS · Zustand · TanStack Query

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 22 | `nvm install 22` |
| pnpm | ≥ 9.15 | `npm i -g pnpm@9.15.0` |
| Docker | ≥ 24 | [docker.com](https://docker.com) |

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/uniportal-erp
cd uniportal-erp
pnpm install
```

### 2. Generate RS256 key pair (one-time)

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Base64-encode both (no line breaks)
JWT_PRIVATE_KEY_B64=$(base64 -w 0 private.pem)
JWT_PUBLIC_KEY_B64=$(base64 -w 0 public.pem)

# Generate AES-256 encryption key (32 bytes = 64 hex chars)
ENCRYPTION_KEY_HEX=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo "JWT_PRIVATE_KEY_B64=$JWT_PRIVATE_KEY_B64"
echo "JWT_PUBLIC_KEY_B64=$JWT_PUBLIC_KEY_B64"
echo "ENCRYPTION_KEY_HEX=$ENCRYPTION_KEY_HEX"

# Clean up key files — never commit these
rm private.pem public.pem
```

### 3. Set up environment

```bash
cp .env.example .env
# Edit .env with the values from step 2
```

### 4. Start infrastructure

```bash
# PostgreSQL 16 + Redis 7 (required)
docker-compose up -d postgres redis

# Optional: PgAdmin + Redis Commander
docker-compose --profile tools up -d
```

### 5. Run database migrations

```bash
pnpm db:migrate:dev
# When prompted, name the migration: "initial_foundation_schema"
```

### 5.5. Bootstrap local database role passwords (required — see P0-3, docs/CHANGELOG.md)

Migrations create the `uniportal_app` and `uniportal_system` roles the app
connects as, but deliberately don't set a password (credentials never live
in a committed SQL file). Without this step, `pnpm dev` fails with a
database authentication error the first time the API queries anything:

```bash
pnpm db:bootstrap-roles
```

This matches the `CHANGE_ME` placeholder password already in
`apps/api/.env.example`. If you changed that password in your own `.env`,
run `LOCAL_DB_PASSWORD=your-password pnpm db:bootstrap-roles` instead.

### 6. Seed the database

```bash
# Creates InstitutionSettings + super_admin user
pnpm db:seed
```

### 7. Start development servers

```bash
# Both API (port 3001) and Web (port 3000) in parallel
pnpm dev
```

- **Frontend:** http://localhost:3000
- **API:**      http://localhost:3001/api
- **Swagger:**  http://localhost:3001/api/docs
- **Health:**   http://localhost:3001/api/health
- **PgAdmin:**  http://localhost:5050 (tools profile)

---

## Development Commands

```bash
pnpm dev              # Start API + Web in watch mode
pnpm build            # Build all apps
pnpm test             # Run all unit tests
pnpm lint             # ESLint all packages
pnpm type-check       # TypeScript check all packages
pnpm format           # Prettier format all files

# Database
pnpm db:migrate:dev   # Create + apply migration (dev)
pnpm db:studio        # Open Prisma Studio
pnpm db:seed          # Seed foundation data
pnpm db:generate      # Regenerate Prisma client after schema change
```

---

## Default Credentials

After running `pnpm db:seed`:

| Field | Value |
|-------|-------|
| Email | `admin@uniportal.dev` |
| Password | `Admin@123456!` |
| Role | `SUPER_ADMIN` |

> ⚠️ **Change the password immediately after first login.**  
> Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` env vars before seeding in non-dev environments.

---

## Project Structure

```
apps/api/
├── src/
│   ├── app.module.ts           Root module
│   ├── main.ts                 Bootstrap (Helmet, CORS, Swagger)
│   ├── database/
│   │   ├── prisma.service.ts   PrismaClient + soft-delete + withRls()
│   │   ├── database.module.ts  Global Prisma module
│   │   └── partition-manager.service.ts  Monthly partition creation (Fix H2)
│   ├── common/
│   │   ├── decorators/         @Roles, @StaffScopes, @FeatureFlag, @Public
│   │   ├── filters/            GlobalExceptionFilter → ApiError envelope
│   │   ├── guards/             RolesGuard (RBAC + ABAC)
│   │   └── interceptors/       LoggingInterceptor (structured JSON)
│   └── health/                 /api/health, /api/health/live, /api/health/ready
├── prisma/
│   ├── schema.prisma           ← SINGLE SOURCE OF TRUTH for DB schema
│   ├── seed.ts                 Foundation seed data
│   └── migrations/             Prisma migration history
```

---

## Critical Evaluation Fixes Applied (June 2026)

The following issues from the independent technical review are fixed in this codebase:

| ID | Issue | Fix Location |
|----|-------|-------------|
| B5 | Soft-delete middleware missing 4 actions | `prisma.service.ts` |
| B6 | `setRlsContext()` silently bypassed RLS outside transaction | `prisma.service.ts` — method removed |
| H1 | AES encryption had no key version → rotation impossible | `packages/utils/src/encryption.ts` |
| H2 | Monthly DB partition creation had no automated job | `partition-manager.service.ts` |
| H4 | Degree certificate verification absent | `schema.prisma` — `DegreeVerificationToken` model |
| H7 | MFA backup codes not modelled | `schema.prisma` — `MfaBackupCode` model |
| M1 | Advisory lock hash collision (JS string concat) | `packages/utils/src/date.ts` |
| M2 | Course repeat policy undefined | `schema.prisma` — `courseRepeatPolicy` on `InstitutionSettings` |
| M12 | Refresh interceptor didn't handle refresh-endpoint 401 | `apps/web/lib/api-client.ts` |

**Deferred fixes** (applied in the phase where the relevant code is written):
- B1, B2: `CourseRegistration.semesterId` + `SemesterGpa` reverse relation → **Phase 3**
- B3: CGPA not updated on senate-publish → **Phase 5**
- B4: Fee clearance race condition → **Phase 4**
- H3: EventEmitter2 no retry on failure → **Phase 4** (fee clearance moved into payment transaction)
- H6: Webhook HMAC spec → **Phase 4**
- H8: `:courseId` → `:courseOfferingId` in result endpoints → **Phase 5**
- H9: k6 scenario scripts → **Phase 10**
- H10: Notification concurrency matched to SES rate limit → **Phase 7**

---

## Phase Roadmap

| Phase | Weeks | Focus |
|-------|-------|-------|
| **P0 ✅** | 1–2 | Foundation: Turborepo, Docker, Prisma, shared packages |
| P1 | 3–5 | Auth: JWT RS256, MFA, RBAC, RLS |
| P2 | 6–8 | Institution: Settings, Calendar (ASUU), Curriculum |
| P3 | 9–12 | Students: Admissions, Registration, Matric numbers |
| P4 | 13–15 | Fees: Invoices, Remita/Paystack, BullMQ |
| P5 | 16–19 | Results: FSM, CGPA, Clearance, NYSC |
| P6 | 20–23 | HR: Staff, Payroll FSM, IPPIS/PenCom |
| P7 | 24–27 | Services: Library, Timetable, LMS, Hostels |
| P8 | 28–31 | Extended: Clinic, Transport, Research, Alumni |
| P9 | 32–34 | Reports, Search, Analytics, Audit viewer |
| P10 | 35–38 | Production: NDPR, AWS Terraform, k6, DR |

---

## Security

- All secrets in **AWS Secrets Manager** for staging/production — never `.env` files
- JWT RS256 signed, 15-min TTL; refresh tokens in httpOnly Secure cookie + Redis
- AES-256-GCM for PII columns (NIN, BVN, medical records) with **key versioning**
- PostgreSQL Row-Level Security policies applied via raw SQL migrations
- MFA (TOTP) mandatory for `SUPER_ADMIN`, `BURSAR`, `VC` roles
- NDPR 2019 · OWASP Top 10 · ISO 27001 compliance targets

---

## Contributing

See `docs/CONTRIBUTING.md` (added in P1).

**Branch strategy:** `main` → production · `develop` → staging · `feature/*` → PRs to develop

**Commit format:** `type(scope): message` — e.g. `feat(auth): add TOTP MFA setup endpoint`

## Admissions V5

The application journey is available at `/apply` and public application tracking at `/apply/status`. The admissions API now supports normalized applicant/application records, programme-specific requirements, O'Level records, document verification, explainable screening, admission decisions/offers, waitlists/deferments, cycle-scoped duplicate protection and idempotent public submission. See `docs/ADMISSIONS_DOMAIN_V5.md`.
