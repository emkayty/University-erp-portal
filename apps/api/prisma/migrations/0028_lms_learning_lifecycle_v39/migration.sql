-- V39 LMS learning lifecycle: submissions, progress, and moderated discussions.
DO $$ BEGIN
  CREATE TYPE "LmsSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'GRADED', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "lms_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "contentId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "responseText" TEXT,
  "fileUrl" VARCHAR(1000),
  "status" "LmsSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "score" DECIMAL(8,2),
  "feedback" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gradedAt" TIMESTAMP(3),
  "gradedById" UUID,
  CONSTRAINT "lms_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_lms_submission_content_student" UNIQUE ("contentId", "studentId"),
  CONSTRAINT "lms_submissions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "course_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lms_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lms_submissions_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_lms_submission_student_status" ON "lms_submissions"("studentId", "status");

CREATE TABLE IF NOT EXISTS "lms_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "contentId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "progressPct" SMALLINT NOT NULL DEFAULT 0,
  "firstViewedAt" TIMESTAMP(3),
  "lastViewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "lms_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_lms_progress_content_student" UNIQUE ("contentId", "studentId"),
  CONSTRAINT "lms_progress_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "course_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lms_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lms_progress_pct_check" CHECK ("progressPct" >= 0 AND "progressPct" <= 100)
);
CREATE INDEX IF NOT EXISTS "idx_lms_progress_student_completed" ON "lms_progress"("studentId", "completedAt");

CREATE TABLE IF NOT EXISTS "lms_discussion_posts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "courseOfferingId" UUID NOT NULL,
  "contentId" UUID,
  "authorId" UUID NOT NULL,
  "parentId" UUID,
  "body" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lms_discussion_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lms_discussion_posts_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lms_discussion_posts_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "course_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lms_discussion_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lms_discussion_posts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "lms_discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_lms_discussion_offering_created" ON "lms_discussion_posts"("courseOfferingId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_lms_discussion_content_created" ON "lms_discussion_posts"("contentId", "createdAt");
