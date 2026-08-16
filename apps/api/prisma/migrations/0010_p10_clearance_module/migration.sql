-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0010: Clearance module (AUDIT-H3)
--
-- Uses quoted camelCase column names throughout, matching what Prisma
-- actually generates from schema.prisma with no @map anywhere (see
-- AUDIT-M1 / migration 0011 for the broader investigation this confirmed).
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "ClearanceStatus" AS ENUM ('PENDING', 'CLEARED', 'BLOCKED', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "clearance_items" (
  "id"                      UUID             NOT NULL DEFAULT gen_random_uuid(),
  "name"                    VARCHAR(100)     NOT NULL,
  "description"             TEXT,
  "responsibleRole"         "RoleName"       NOT NULL,
  "isRequiredForGraduation" BOOLEAN          NOT NULL DEFAULT true,
  "isAutoCleared"           BOOLEAN          NOT NULL DEFAULT false,
  "isActive"                BOOLEAN          NOT NULL DEFAULT true,
  "sortOrder"               INTEGER          NOT NULL DEFAULT 0,
  "createdAt"               TIMESTAMP(3)     NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_clearance_items_grad" ON "clearance_items" ("isRequiredForGraduation");

CREATE TABLE IF NOT EXISTS "student_clearances" (
  "id"              UUID             NOT NULL DEFAULT gen_random_uuid(),
  "studentId"       UUID             NOT NULL,
  "clearanceItemId" UUID             NOT NULL,
  "status"          "ClearanceStatus" NOT NULL DEFAULT 'PENDING',
  "clearedById"     UUID,
  "clearedAt"       TIMESTAMP(3),
  "blockedById"     UUID,
  "blockedAt"       TIMESTAMP(3),
  "blockReason"     TEXT,
  "waivedById"      UUID,
  "waivedAt"        TIMESTAMP(3),
  "waiverReason"    TEXT,
  "remarks"         TEXT,
  "updatedAt"       TIMESTAMP(3)     NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "student_clearances_studentId_fkey"       FOREIGN KEY ("studentId")       REFERENCES "students"("id"),
  CONSTRAINT "student_clearances_clearanceItemId_fkey" FOREIGN KEY ("clearanceItemId") REFERENCES "clearance_items"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_clearances_studentId_clearanceItemId_key"
  ON "student_clearances" ("studentId", "clearanceItemId");
CREATE INDEX IF NOT EXISTS "idx_clearance_student" ON "student_clearances" ("studentId", "status");

-- Default clearance items — spec §15.1's named default set. isAutoCleared
-- marks the ones ClearanceService.report-driven auto-clear handlers apply
-- (Fees on payment.completed, Library on library.clearance.updated —
-- see fee-clearance.service.ts's existing pattern); the rest require a
-- manual CLEARED action by the responsible role.
INSERT INTO "clearance_items" ("name", "responsibleRole", "isAutoCleared", "sortOrder") VALUES
  ('Fees Clearance',        'BURSAR',    true,  1),
  ('Library Clearance',     'STAFF',     true,  2),
  ('Hostel Clearance',      'STAFF',     true,  3),
  ('Clinic Clearance',      'STAFF',     false, 4),
  ('Timetable/Exams',       'REGISTRAR', false, 5),
  ('Departmental Clearance','HOD',       false, 6),
  ('Faculty Clearance',     'DEAN',      false, 7),
  ('Registrar Clearance',   'REGISTRAR', false, 8)
ON CONFLICT DO NOTHING;
