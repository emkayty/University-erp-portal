import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from '@uniportal/config';
import { QUEUE_NAMES } from './common/queue-names';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ReliabilityModule } from './reliability/reliability.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { RedisModule, REDIS_CLIENT } from './common/redis/redis.module';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler.storage';
import { resolveRedisConnection } from './common/redis/redis-connection';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { FeatureFlagGuard } from './common/guards/feature-flag.guard';
import { RlsModule } from './common/rls/rls.module';
import { AuthorizationModule } from './common/authorization/authorization.module';
import { RlsInterceptor } from './common/rls/rls.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { StudentsModule } from './modules/students/students.module';
import { FeesModule } from './modules/fees/fees.module';
import { ExamsModule } from './modules/exams/exams.module';
import { ResultsModule } from './modules/results/results.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { AcademicModule } from './modules/academic/academic.module';

import { HrModule } from './modules/hr/hr.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { LibraryModule } from './modules/library/library.module';
import { HostelModule } from './modules/hostel/hostel.module';
import { LmsModule } from './modules/lms/lms.module';
// P8 modules
import { ClinicModule } from './modules/clinic/clinic.module';
import { TransportModule } from './modules/transport/transport.module';
import { ResearchModule } from './modules/research/research.module';
import { AlumniModule } from './modules/alumni/alumni.module';

// P9 modules
import { ReportsModule } from './modules/reports/reports.module';
import { SearchModule } from './modules/search/search.module';
import { AuditViewerModule } from './modules/audit-viewer/audit-viewer.module';

// P10 modules
import { PrivacyModule } from './modules/privacy/privacy.module';
import { SecurityModule } from './modules/security/security.module';
import { ClearanceModule } from './modules/clearance/clearance.module';
import { UniversityPoliciesModule } from './modules/policies/university-policies.module';

// P0-6 FIX (this pass): QUEUE_NAMES moved to ./common/queue-names.ts to
// break a genuine circular dependency — see that file's header comment for
// the full trace. app.module.ts is now a consumer of QUEUE_NAMES like every
// other file, not the thing everything else circularly imported it from.

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    ScheduleModule.forRoot(),
    RlsModule, // audit remediation R2 — global RLS ambient-context service
    AuthorizationModule,
    // AUDIT-C1 fix: EventEmitterModule.forRoot(...) removed. As of this fix,
    // nothing in the codebase injects EventEmitter2 or declares @OnEvent —
    // every domain event goes through OutboxService (common/outbox/) →
    // BullMQ → NotificationsProcessor instead, which is durable and actually
    // has listeners. Re-add this only if a genuine need for synchronous,
    // in-process (non-durable) pub/sub comes up — don't reach for it as the
    // default for anything crossing a module boundary; that's exactly what
    // silently broke calendar/student/admissions notifications before this
    // fix (see docs/CHANGELOG.md, AUDIT-C1).

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule], inject: [ConfigService, REDIS_CLIENT],
      useFactory: (c: ConfigService, redis: import('ioredis').default) => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          { name: 'auth', ttl: c.get('THROTTLE_AUTH_TTL', 60000), limit: c.get('THROTTLE_AUTH_LIMIT', 5) },
          { name: 'api',  ttl: c.get('THROTTLE_API_TTL',  60000), limit: c.get('THROTTLE_API_LIMIT', 100) },
        ],
      }),
    }),

    // C4 FIX: cache-manager v6 uses milliseconds. 300_000 = 5 minutes.
    CacheModule.registerAsync({
      isGlobal: true, imports: [ConfigModule], inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        store: 'ioredis',
        ...resolveRedisConnection(c),
        ttl: 300_000, // cache-manager v6 uses milliseconds: 5 minutes.
      }),
    }),

    // H6 FIX: BullMQ scaffolded now so P4+ modules simply register their named queue
    BullModule.forRootAsync({
      imports: [ConfigModule], inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        connection: resolveRedisConnection(c),
        defaultJobOptions: {
          removeOnComplete: { count: 1000, age: 86400 },
          removeOnFail:     { count: 500 },
          attempts:  3,
          backoff:   { type: 'exponential', delay: 5000 },
        },
      }),
    }),

    // Register all queues globally — workers added in their respective phase modules
    BullModule.registerQueue(
      ...Object.values(QUEUE_NAMES).map((name) => ({ name })),
    ),

    RedisModule,
    DatabaseModule,
    HealthModule,
    ReliabilityModule,
    IntelligenceModule,
    // P1
    AuthModule, UsersModule,
    // P2
    SettingsModule, CalendarModule, CurriculumModule,
    // P3
    AdmissionsModule, StudentsModule,
    // P4
    FeesModule,
    // P5
    ExamsModule, ResultsModule, AssessmentModule, AcademicModule,
    // P6
    HrModule, PayrollModule,
    // P7
    NotificationsModule, LibraryModule, HostelModule, LmsModule,
    // P8: Clinic, Transport, Research & Grants, Alumni
    ClinicModule, TransportModule, ResearchModule, AlumniModule,
    // P9: Reports, Search, Audit Viewer
    ReportsModule, SearchModule, AuditViewerModule,
    // P10: NDPR compliance hardening
    PrivacyModule, SecurityModule, UniversityPoliciesModule,
    // P10 (AUDIT-H3): Clearance — previously missing despite being assumed
    // by students.service.ts's matriculation seeding and the reports
    // module's CLEARANCE_STATUS case
    ClearanceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // AUDIT-H1 fix (escalated from its original scope): @FeatureFlag() is
    // pure SetMetadata() — it does nothing without FeatureFlagGuard reading
    // it. That guard existed but was registered NOWHERE — not globally, and
    // not via @UseGuards() on research/clinic/transport/alumni either,
    // despite each already carrying the @FeatureFlag() decorator. Every
    // optional module was fully accessible regardless of its flag's value.
    // Global registration (rather than adding @UseGuards(FeatureFlagGuard)
    // to five separate controllers) means the NEXT feature-flagged module
    // can't reintroduce this by forgetting the same manual step.
    { provide: APP_GUARD, useClass: FeatureFlagGuard },

    // Audit remediation R2 ("RLS is decorative"): root-cause fix, same
    // pattern as the FeatureFlagGuard fix above — a single global provider
    // instead of relying on every service remembering to opt in. Runs
    // after the guards above, so req.user is already populated by
    // JwtAuthGuard. Currently only PrivacyService reads the ambient client
    // this sets up (see privacy.service.ts); see docs/CHANGELOG.md
    // item R2 for what "wire this up everywhere" still requires.
    { provide: APP_INTERCEPTOR, useClass: RlsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
