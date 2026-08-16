# UniPortal ERP V36 Repair Changelog

## Applied repairs

The V36 repair pass addressed the cross-layer audit findings.

| Finding | Repair |
|---|---|
| Migration URL was absent from the CodeDeploy secret path | Terraform now provisions `migrateDatabaseUrl`; the secret-fetch hook emits `MIGRATE_DATABASE_URL`; the migration hook requires and documents it; the shared environment schema declares it. |
| Clean commands depended on manual Prisma generation | Root `prebuild`, `pretype-check`, and `pretest` scripts now run `pnpm db:generate`; Turbo cache inputs include `MIGRATE_DATABASE_URL`. |
| Notifications page had no backend HTTP contract | Added versioned `GET /api/v1/enterprise/notifications` and `PATCH /api/v1/enterprise/notifications/:id/read`, backed by persisted notification records and registered in `NotificationsModule`. |
| Payroll exports bypassed the API origin and bearer token | Added authenticated binary download support to the shared API client and changed payroll exports to fetch a Blob through the client before downloading. |
| Logout returned 204 while the client always parsed JSON | The API client now treats HTTP 204 as a successful no-content response. |
| ESLint 9 could not find a configuration | Added a workspace ESLint 9 flat config, updated web lint to use the ESLint CLI, and retained a documented compatibility baseline for the legacy monorepo. |
| Contract coverage did not exercise the audit fixes | Added notifications route metadata coverage and expanded the V36 trace contract to verify notifications, 204 handling, payroll downloads, migration secret propagation, and Prisma bootstrap wiring. |
| Lint exposed unrelated legacy errors | Applied safe source fixes to the shared utility code, password validation expression, and stale React Hooks suppression. |

## Verification

The repaired source was verified with the following results:

| Check | Result |
|---|---:|
| `prisma validate` with `DATABASE_URL` and `MIGRATE_DATABASE_URL` | Pass |
| Serial Turbo build | Pass; 5 tasks successful |
| Workspace type-check | Pass; 9 tasks successful |
| Serial workspace lint | Pass; 5 lint tasks successful |
| Workspace tests | Pass; API 21 suites / 348 tests, utilities 5 suites / 36 tests |
| API route-contract tests | Pass; 13 tests |
| V36 cross-layer repair contract | Pass; all 9 assertions |
| `pnpm install --frozen-lockfile --ignore-scripts` | Pass; lockfile up to date |

The production build was also run independently for both `@uniportal/api` and `@uniportal/web`; both completed successfully.
