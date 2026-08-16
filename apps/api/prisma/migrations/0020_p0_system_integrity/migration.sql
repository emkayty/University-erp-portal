BEGIN;

CREATE TYPE "CurriculumVersionStatus" AS ENUM ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED');
CREATE TABLE "curriculum_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "programmeId" uuid NOT NULL,
  "academicYear" varchar(9) NOT NULL,
  "version" smallint NOT NULL DEFAULT 1,
  "status" "CurriculumVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" date,
  "effectiveTo" date,
  "approvedById" uuid,
  "approvedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "curriculum_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_versions_programme_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_curriculum_version" ON "curriculum_versions"("programmeId","version");
CREATE INDEX "idx_curriculum_version_status" ON "curriculum_versions"("programmeId","status");
CREATE UNIQUE INDEX "uq_curriculum_active_per_programme" ON "curriculum_versions"("programmeId") WHERE "status"='ACTIVE';

INSERT INTO "curriculum_versions" ("id","programmeId","academicYear","version","status","createdAt","updatedAt")
SELECT gen_random_uuid(), p."id",
  COALESCE((SELECT ac."academicYear" FROM "academic_calendars" ac WHERE ac."isActive"=TRUE ORDER BY ac."createdAt" DESC LIMIT 1),'0000/0000'),
  1,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "programmes" p
WHERE NOT EXISTS (SELECT 1 FROM "curriculum_versions" cv WHERE cv."programmeId"=p."id");

ALTER TABLE "programme_courses" ADD COLUMN "curriculumVersionId" uuid;
UPDATE "programme_courses" pc SET "curriculumVersionId"=cv."id"
FROM "curriculum_versions" cv WHERE cv."programmeId"=pc."programmeId" AND cv."version"=1;
ALTER TABLE "programme_courses" ADD COLUMN "ccmasCategory" "CcmasCategory" NOT NULL DEFAULT 'CORE';
UPDATE "programme_courses" pc SET "ccmasCategory"=c."ccmasCategory" FROM "courses" c WHERE c."id"=pc."courseId";
ALTER TABLE "programme_courses" ALTER COLUMN "curriculumVersionId" SET NOT NULL;
DROP INDEX IF EXISTS "uq_prog_course_sem";
CREATE UNIQUE INDEX "uq_curriculum_course_sem" ON "programme_courses"("curriculumVersionId","courseId","level","semester");
CREATE INDEX "idx_curriculum_course_level" ON "programme_courses"("curriculumVersionId","level");
ALTER TABLE "programme_courses" ADD CONSTRAINT "programme_courses_curriculum_version_fkey"
  FOREIGN KEY ("curriculumVersionId") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "students" ADD COLUMN "personId" uuid;
UPDATE "students" s SET "personId"=a."personId" FROM "applicants" a WHERE a."id"=s."applicantId" AND a."personId" IS NOT NULL;
DO $$
DECLARE r RECORD; pid uuid;
BEGIN
  FOR r IN SELECT s."id","firstName","lastName","middleName","dateOfBirth","gender","nationality","stateOfOrigin","email","phone"
           FROM "students" s WHERE s."personId" IS NULL LOOP
    INSERT INTO "persons"("id","firstName","lastName","middleName","dateOfBirth","gender","nationality","stateOfOrigin","lga","primaryEmail","primaryPhone","createdAt","updatedAt")
    VALUES(gen_random_uuid(),r."firstName",r."lastName",r."middleName",r."dateOfBirth",r."gender",r."nationality",r."stateOfOrigin",NULL,r."email",r."phone",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    RETURNING "id" INTO pid;
    UPDATE "students" SET "personId"=pid WHERE "id"=r."id";
  END LOOP;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "students" WHERE "personId" IS NULL) THEN RAISE EXCEPTION 'P0 identity migration failed: student without Person'; END IF;
END $$;
ALTER TABLE "students" ALTER COLUMN "personId" SET NOT NULL;
ALTER TABLE "students" ADD CONSTRAINT "students_person_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "students_personId_key" ON "students"("personId");

ALTER TABLE "students" ADD COLUMN "curriculumVersionId" uuid;
UPDATE "students" s SET "curriculumVersionId"=cv."id" FROM "curriculum_versions" cv
WHERE cv."programmeId"=s."programmeId" AND cv."status"='ACTIVE' AND s."curriculumVersionId" IS NULL;
UPDATE "students" s SET "curriculumVersionId"=cv."id" FROM "curriculum_versions" cv
WHERE cv."programmeId"=s."programmeId" AND cv."version"=1 AND s."curriculumVersionId" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "students" WHERE "curriculumVersionId" IS NULL) THEN RAISE EXCEPTION 'P0 curriculum migration failed: student without curriculum'; END IF;
END $$;
ALTER TABLE "students" ALTER COLUMN "curriculumVersionId" SET NOT NULL;
ALTER TABLE "students" ADD CONSTRAINT "students_curriculum_version_fkey"
  FOREIGN KEY ("curriculumVersionId") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "idx_students_curriculum_version" ON "students"("curriculumVersionId");

ALTER TABLE "course_offerings" ADD COLUMN "sectionCode" varchar(10) NOT NULL DEFAULT 'A';
UPDATE "course_offerings" co SET "semesterId"=s."id" FROM "semesters" s
WHERE co."semesterId" IS NULL AND s."academicYear"=co."academicYear"
AND s."semesterNumber"=CASE co."semester" WHEN 'FIRST' THEN 1 WHEN 'SECOND' THEN 2 WHEN 'SUMMER' THEN 3 ELSE NULL END;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "course_offerings" WHERE "semesterId" IS NULL) THEN RAISE EXCEPTION 'P0 course offering migration failed: offering without Semester'; END IF;
END $$;
ALTER TABLE "course_offerings" ALTER COLUMN "semesterId" SET NOT NULL;
DROP INDEX IF EXISTS "uq_course_offering";
CREATE UNIQUE INDEX "uq_course_offering_section" ON "course_offerings"("courseId","semesterId","sectionCode");
CREATE INDEX "idx_offering_calendar_semester" ON "course_offerings"("academicCalendarId","semesterId");
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_lecturer_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION sync_course_offering_legacy_semester() RETURNS trigger AS $$
BEGIN
  SELECT CASE s."semesterNumber" WHEN 1 THEN 'FIRST'::"SemesterTerm" WHEN 2 THEN 'SECOND'::"SemesterTerm" WHEN 3 THEN 'SUMMER'::"SemesterTerm" ELSE NULL END
  INTO NEW."semester" FROM "semesters" s WHERE s."id"=NEW."semesterId";
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_course_offering_legacy_semester ON "course_offerings";
CREATE TRIGGER trg_course_offering_legacy_semester BEFORE INSERT OR UPDATE OF "semesterId" ON "course_offerings" FOR EACH ROW EXECUTE FUNCTION sync_course_offering_legacy_semester();

ALTER TABLE "faculties" ADD CONSTRAINT "faculties_dean_fkey" FOREIGN KEY ("deanId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "uq_faculty_dean" ON "faculties"("deanId") WHERE "deanId" IS NOT NULL;
ALTER TABLE "departments" ADD CONSTRAINT "departments_hod_fkey" FOREIGN KEY ("hodId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "uq_department_hod" ON "departments"("hodId") WHERE "hodId" IS NOT NULL;

ALTER TABLE "exam_candidates"
  ADD CONSTRAINT "exam_candidates_timetable_fkey" FOREIGN KEY ("examTimetableId") REFERENCES "exam_timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "exam_candidates_student_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_invigilators"
  ADD CONSTRAINT "exam_invigilators_timetable_fkey" FOREIGN KEY ("examTimetableId") REFERENCES "exam_timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "exam_invigilators_staff_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_attendance"
  ADD CONSTRAINT "exam_attendance_timetable_fkey" FOREIGN KEY ("examTimetableId") REFERENCES "exam_timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "exam_attendance_student_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "exam_attendance_recorded_by_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_recorded_by_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_timetables" ADD COLUMN IF NOT EXISTS "venueId" uuid;
ALTER TABLE "exam_timetables" ADD CONSTRAINT "exam_timetables_venue_fkey"
  FOREIGN KEY ("venueId") REFERENCES "exam_venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "student_results" ADD CONSTRAINT "student_results_registration_fkey"
  FOREIGN KEY ("studentId","courseOfferingId") REFERENCES "course_registrations"("studentId","courseOfferingId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_registration_fkey"
  FOREIGN KEY ("studentId","courseOfferingId") REFERENCES "course_registrations"("studentId","courseOfferingId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_attendance" ADD CONSTRAINT "exam_attendance_candidate_fkey"
  FOREIGN KEY ("examTimetableId","studentId") REFERENCES "exam_candidates"("examTimetableId","studentId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_offering_fkey"
  FOREIGN KEY ("courseOfferingId") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_offering_fkey"
  FOREIGN KEY ("courseOfferingId") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grade_upload_batches"
  ADD CONSTRAINT "grade_upload_batches_offering_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "grade_upload_batches_semester_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "grade_upload_batches_uploaded_by_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_assessment_mark_context() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "assessment_components" ac JOIN "assessment_schemes" s ON s."id"=ac."schemeId"
    WHERE ac."id"=NEW."componentId" AND s."courseOfferingId"=NEW."courseOfferingId") THEN
    RAISE EXCEPTION 'Assessment mark component does not belong to the supplied course offering';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_validate_assessment_mark_context ON "assessment_marks";
CREATE TRIGGER trg_validate_assessment_mark_context BEFORE INSERT OR UPDATE OF "componentId","courseOfferingId" ON "assessment_marks" FOR EACH ROW EXECUTE FUNCTION validate_assessment_mark_context();

CREATE OR REPLACE FUNCTION validate_grade_upload_context() RETURNS trigger AS $$
DECLARE offering_semester uuid;
BEGIN
  SELECT "semesterId" INTO offering_semester FROM "course_offerings" WHERE "id"=NEW."courseOfferingId";
  IF offering_semester IS NULL OR offering_semester<>NEW."semesterId" THEN RAISE EXCEPTION 'Grade upload semester does not match course offering semester'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_validate_grade_upload_context ON "grade_upload_batches";
CREATE TRIGGER trg_validate_grade_upload_context BEFORE INSERT OR UPDATE OF "courseOfferingId","semesterId" ON "grade_upload_batches" FOR EACH ROW EXECUTE FUNCTION validate_grade_upload_context();

ALTER TABLE "admission_decisions" ADD COLUMN "programmeId" uuid;
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_programme_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "idx_admission_decision_programme" ON "admission_decisions"("programmeId");

ALTER TABLE "olevel_subjects" ADD COLUMN "subjectId" uuid;
UPDATE "olevel_subjects" os SET "subjectId"=s."id" FROM "ref_academic_subjects" s WHERE lower(trim(os."subject"))=lower(trim(s."name"));
ALTER TABLE "olevel_subjects" ADD CONSTRAINT "olevel_subjects_subject_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "ref_academic_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "idx_olevel_subject_reference" ON "olevel_subjects"("subjectId");

CREATE UNIQUE INDEX "uq_appointment_id_patient" ON "appointments"("id","patientId");
CREATE UNIQUE INDEX "uq_medical_record_id_patient" ON "medical_records"("id","patientId");
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_appointment_patient_fkey"
  FOREIGN KEY ("appointmentId","patientId") REFERENCES "appointments"("id","patientId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_record_patient_fkey"
  FOREIGN KEY ("medicalRecordId","patientId") REFERENCES "medical_records"("id","patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "GraduationCandidateStatus" AS ENUM ('ELIGIBILITY_CHECKED','DEPARTMENT_RECOMMENDED','FACULTY_REVIEWED','APPROVED','REJECTED','GRADUATED');
CREATE TABLE "graduation_candidates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "studentId" uuid NOT NULL,
  "academicYear" varchar(9) NOT NULL,
  "status" "GraduationCandidateStatus" NOT NULL DEFAULT 'ELIGIBILITY_CHECKED',
  "academicEligible" boolean NOT NULL DEFAULT false,
  "administrativeEligible" boolean NOT NULL DEFAULT false,
  "auditSnapshot" jsonb NOT NULL,
  "recommendedById" uuid,
  "recommendedAt" timestamp(3),
  "approvedById" uuid,
  "approvedAt" timestamp(3),
  "rejectionReason" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "graduation_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graduation_candidates_student_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_graduation_candidate_student_year" ON "graduation_candidates"("studentId","academicYear");
CREATE INDEX "idx_graduation_candidate_year_status" ON "graduation_candidates"("academicYear","status");

ALTER TABLE "graduation_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "graduation_candidates" FORCE ROW LEVEL SECURITY;
CREATE POLICY graduation_candidate_read ON "graduation_candidates" FOR SELECT USING (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','VC','REGISTRAR','DEAN')
  OR "studentId" IN (SELECT id FROM students WHERE "userId"::text=current_setting('app.current_user_id',true))
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
);
CREATE POLICY graduation_candidate_insert ON "graduation_candidates" FOR INSERT WITH CHECK (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','REGISTRAR','DEAN')
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
);
CREATE POLICY graduation_candidate_update ON "graduation_candidates" FOR UPDATE USING (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','VC','REGISTRAR','DEAN')
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
) WITH CHECK (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','VC','REGISTRAR','DEAN')
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
);

COMMIT;
