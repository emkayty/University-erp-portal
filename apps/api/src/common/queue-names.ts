/**
 * QUEUE_NAMES — the full BullMQ queue registry.
 *
 * P0-6 FIX (this pass — see docs/CHANGELOG.md): this used to be
 * defined and exported directly from app.module.ts. That created a genuine
 * circular dependency, not a hypothetical one: app.module.ts imports every
 * feature module (CalendarModule, NotificationsModule, FeesModule,
 * PrivacyModule, SecurityModule, AdmissionsModule, and outbox.module.ts via
 * several of those) at the TOP of the file — before the QUEUE_NAMES export
 * further down. Several of those modules and their processors read
 * QUEUE_NAMES.<X> directly inside a class decorator (`@Module({ imports:
 * [BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })] })`,
 * `@Processor(QUEUE_NAMES.PAYMENT_RECONCILIATION)`), which evaluates at
 * MODULE-LOAD time, not lazily inside a method body.
 *
 * Node's CommonJS `require()` is synchronous and eager: when app.module.ts's
 * own top-level `import { CalendarModule } from './modules/calendar/
 * calendar.module'` runs, Node fully evaluates calendar.module.ts (and
 * everything IT imports, including outbox.module.ts) BEFORE returning to
 * finish executing the rest of app.module.ts — including the line that
 * assigns QUEUE_NAMES. Node detects the cycle back to app.module.ts and
 * returns the CURRENTLY-PARTIAL exports object, in which QUEUE_NAMES does
 * not exist yet. Every one of the affected files crashed with "Cannot read
 * properties of undefined (reading '<QUEUE_NAME>')" — not as a jest/sandbox
 * artifact, but on the very first `pnpm start` / `node dist/main.js`, since
 * this is standard, deterministic CommonJS module-resolution behavior,
 * independent of bundler or test runner. This was caught only by actually
 * loading the module graph (see docs/CHANGELOG.md's note on why
 * running the toolchain — not re-reading the code — is what surfaces this
 * class of bug).
 *
 * THE FIX: move QUEUE_NAMES to its own file with zero imports of its own,
 * so nothing that depends on it can ever be mid-evaluation of the thing
 * that defines it. app.module.ts now imports QUEUE_NAMES from here like
 * everything else does, instead of being the thing everything else
 * circularly imports it FROM.
 */
export const QUEUE_NAMES = {
  ADMISSIONS_OPS:         'admissions-ops',
  INVOICE_GENERATION:     'invoice-generation',
  PAYMENT_RECONCILIATION: 'payment-reconciliation',
  PAYROLL_COMPUTE:        'payroll-compute',
  RESULT_NOTIFICATIONS:   'result-notifications',
  NOTIFICATIONS:          'notifications',
  REPORT_GENERATION:      'report-generation',
  CALENDAR_OPERATIONS:    'calendar-operations',
  EXTERNAL_API_VERIFY:    'external-api-verify',
  AUDIT_EXPORT:           'audit-export',
  // P10: added for the NDPR breach-notification workflow (spec §16.1) — not
  // in the original 10-queue registry (spec §15.1), documented here as a
  // deliberate, narrow addition rather than overloading an existing queue,
  // since a missed breach reminder has a distinct (regulatory) severity
  // from a missed generic notification.
  BREACH_NOTIFICATION:    'breach-notification',
  ACADEMIC_PROGRESSION:   'academic-progression',
} as const;
