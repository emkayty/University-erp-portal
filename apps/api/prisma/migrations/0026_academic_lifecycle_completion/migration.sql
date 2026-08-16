-- UniPortal academic lifecycle completion: degree audit, progression, planning,
-- exceptions, transfers, appeals, interruption and credentials.
CREATE TABLE "academic_requirement_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "curriculum_version_id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL, "name" VARCHAR(200) NOT NULL, "group_type" VARCHAR(40) NOT NULL DEFAULT 'CORE',
  "min_courses" SMALLINT, "max_courses" SMALLINT, "min_credit_units" SMALLINT, "max_credit_units" SMALLINT,
  "allow_double_counting" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "academic_requirement_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_requirement_groups_curriculum_version_id_fkey" FOREIGN KEY ("curriculum_version_id") REFERENCES "curriculum_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_academic_requirement_group_code" ON "academic_requirement_groups"("curriculum_version_id","code");
CREATE INDEX "idx_academic_requirement_group_type" ON "academic_requirement_groups"("curriculum_version_id","group_type");

CREATE TABLE "academic_requirements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "group_id" UUID NOT NULL, "course_id" UUID,
  "is_compulsory_within_group" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_requirements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_requirement_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academic_requirements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_academic_requirement_course" ON "academic_requirements"("group_id","course_id");
CREATE INDEX "idx_academic_requirement_course" ON "academic_requirements"("course_id");

CREATE TABLE "course_equivalencies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "from_course_id" UUID NOT NULL, "to_course_id" UUID NOT NULL,
  "direction" VARCHAR(20) NOT NULL DEFAULT 'BIDIRECTIONAL', "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3), "approved_by_id" UUID, "reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_equivalencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_equivalencies_from_course_id_fkey" FOREIGN KEY ("from_course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "course_equivalencies_to_course_id_fkey" FOREIGN KEY ("to_course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_course_equivalency_not_self" CHECK ("from_course_id" <> "to_course_id"),
  CONSTRAINT "ck_course_equivalency_direction" CHECK ("direction" IN ('BIDIRECTIONAL','ONE_WAY'))
);
CREATE UNIQUE INDEX "uq_course_equivalency" ON "course_equivalencies"("from_course_id","to_course_id");
CREATE INDEX "idx_course_equivalency_to" ON "course_equivalencies"("to_course_id");

CREATE TABLE "academic_exemptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "curriculum_requirement_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "reason" TEXT NOT NULL, "evidence_ref" VARCHAR(500),
  "approved_by_id" UUID, "approved_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_exemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_exemptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_student_academic_exemption" ON "academic_exemptions"("student_id","curriculum_requirement_id");
CREATE INDEX "idx_student_academic_exemption_status" ON "academic_exemptions"("student_id","status");

CREATE TABLE "academic_transfer_credits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "source_institution" VARCHAR(255) NOT NULL,
  "source_course_code" VARCHAR(50), "source_course_title" VARCHAR(255), "mapped_course_id" UUID, "credit_units" SMALLINT NOT NULL,
  "grade" VARCHAR(10), "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "evidence_ref" VARCHAR(500), "approved_by_id" UUID,
  "approved_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_transfer_credits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_transfer_credits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academic_transfer_credits_mapped_course_id_fkey" FOREIGN KEY ("mapped_course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_transfer_credit_positive" CHECK ("credit_units" > 0)
);
CREATE INDEX "idx_transfer_credit_student_status" ON "academic_transfer_credits"("student_id","status");

CREATE TABLE "degree_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "curriculum_version_id" UUID NOT NULL,
  "status" VARCHAR(30) NOT NULL, "requirement_results" JSONB NOT NULL, "policy_snapshot" JSONB NOT NULL,
  "audited_by_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "degree_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "degree_audits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "degree_audits_curriculum_version_id_fkey" FOREIGN KEY ("curriculum_version_id") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "idx_degree_audit_student_created" ON "degree_audits"("student_id","created_at");
CREATE INDEX "idx_degree_audit_status" ON "degree_audits"("status");

CREATE TABLE "progression_evaluations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "academic_history_id" UUID NOT NULL,
  "outcome" VARCHAR(30) NOT NULL, "recommended_action" VARCHAR(40) NOT NULL, "reasons" JSONB NOT NULL,
  "policy_snapshot" JSONB NOT NULL, "evaluated_by_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "progression_evaluations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "progression_evaluations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "progression_evaluations_academic_history_id_fkey" FOREIGN KEY ("academic_history_id") REFERENCES "student_academic_history"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "idx_progression_student_created" ON "progression_evaluations"("student_id","created_at");

CREATE TABLE "academic_standings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "academic_history_id" UUID NOT NULL,
  "standing" VARCHAR(40) NOT NULL, "reasons" JSONB NOT NULL, "policy_snapshot" JSONB NOT NULL,
  "determined_by_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_standings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_standings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academic_standings_academic_history_id_fkey" FOREIGN KEY ("academic_history_id") REFERENCES "student_academic_history"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "idx_academic_standing_student_created" ON "academic_standings"("student_id","created_at");

CREATE TABLE "academic_placements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "academic_year" VARCHAR(9) NOT NULL,
  "from_level" SMALLINT, "to_level" SMALLINT NOT NULL, "decision" VARCHAR(40) NOT NULL, "reason" TEXT,
  "policy_snapshot" JSONB NOT NULL, "approved_by_id" UUID, "effective_date" DATE NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_placements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_placements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ck_academic_placement_level" CHECK ("to_level" > 0)
);
CREATE INDEX "idx_academic_placement_student_date" ON "academic_placements"("student_id","effective_date");

CREATE TABLE "academic_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "curriculum_version_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', "source_audit_id" UUID, "rationale" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academic_plans_curriculum_version_id_fkey" FOREIGN KEY ("curriculum_version_id") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "idx_academic_plan_student_status" ON "academic_plans"("student_id","status");

CREATE TABLE "academic_plan_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "plan_id" UUID NOT NULL, "course_id" UUID NOT NULL, "sequence" SMALLINT NOT NULL,
  "target_period" VARCHAR(100), "reason" TEXT, "status" VARCHAR(20) NOT NULL DEFAULT 'RECOMMENDED',
  CONSTRAINT "academic_plan_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "academic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academic_plan_items_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_academic_plan_course" ON "academic_plan_items"("plan_id","course_id");
CREATE INDEX "idx_academic_plan_item_sequence" ON "academic_plan_items"("plan_id","sequence");

CREATE TABLE "academic_appeals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "appeal_type" VARCHAR(40) NOT NULL,
  "subject_id" UUID, "reason" TEXT NOT NULL, "evidence_ref" VARCHAR(500), "status" VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  "decision" TEXT, "decided_by_id" UUID, "decided_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_appeals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_appeals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "idx_academic_appeal_student_status" ON "academic_appeals"("student_id","status");

CREATE TABLE "programme_transfer_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "from_programme_id" UUID NOT NULL, "to_programme_id" UUID NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED', "reason" TEXT, "mapped_credits" SMALLINT NOT NULL DEFAULT 0, "decision_note" TEXT,
  "decided_by_id" UUID, "decided_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "programme_transfer_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "programme_transfer_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "programme_transfer_requests_from_programme_id_fkey" FOREIGN KEY ("from_programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "programme_transfer_requests_to_programme_id_fkey" FOREIGN KEY ("to_programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_programme_transfer_not_same" CHECK ("from_programme_id" <> "to_programme_id")
);
CREATE INDEX "idx_programme_transfer_student_status" ON "programme_transfer_requests"("student_id","status");

CREATE TABLE "academic_interruptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "type" VARCHAR(30) NOT NULL, "start_date" DATE NOT NULL,
  "end_date" DATE, "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED', "reason" TEXT, "decided_by_id" UUID, "decided_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_interruptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_interruptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ck_academic_interruption_dates" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);
CREATE INDEX "idx_academic_interruption_student_status" ON "academic_interruptions"("student_id","status");

CREATE TABLE "academic_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "credential_type" VARCHAR(40) NOT NULL,
  "credential_no" VARCHAR(80) NOT NULL, "document_hash" VARCHAR(128), "status" VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3), "snapshot" JSONB NOT NULL,
  CONSTRAINT "academic_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_credentials_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "academic_credentials_credential_no_key" ON "academic_credentials"("credential_no");
CREATE INDEX "idx_academic_credential_student_type" ON "academic_credentials"("student_id","credential_type");

ALTER TABLE "student_academic_history" ADD COLUMN "credit_units_attempted" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "student_academic_history" ADD COLUMN "credit_units_earned" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "student_academic_history" ADD COLUMN "failed_course_count" SMALLINT NOT NULL DEFAULT 0;
