/**
 * Re-exports PrismaClient and all generated types.
 * Import from this package, never directly from @prisma/client,
 * so the import path is stable across the monorepo.
 *
 * @example
 *   import { PrismaClient, Prisma, type User } from '@uniportal/prisma-client';
 */
export { PrismaClient, Prisma } from '@prisma/client';

// Enum re-exports (add as schema grows)
export {
  RoleName,
  InstitutionType,
  GradingSystem,
  AuditAction,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';

// Model type re-exports (add as schema grows)
export type {
  User,
  UserRole,
  Session,
  AuditLog,
  InstitutionSettings,
  NotificationTemplate,
  NotificationLog,
} from '@prisma/client';
