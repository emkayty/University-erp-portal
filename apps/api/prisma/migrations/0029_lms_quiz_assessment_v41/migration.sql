-- V41 LMS quiz assessment and secure submission attachment metadata.
ALTER TABLE "lms_submissions" ADD COLUMN IF NOT EXISTS "attachmentKey" VARCHAR(1000);
ALTER TABLE "lms_submissions" ADD COLUMN IF NOT EXISTS "attachmentName" VARCHAR(255);
ALTER TABLE "lms_submissions" ADD COLUMN IF NOT EXISTS "attachmentMime" VARCHAR(120);
ALTER TABLE "lms_submissions" ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER;
CREATE INDEX IF NOT EXISTS "idx_lms_submission_attachment" ON "lms_submissions"("studentId", "attachmentKey");

DO $$ BEGIN
  CREATE TYPE "QuizQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "quiz_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "contentId" UUID NOT NULL,
  "prompt" TEXT NOT NULL,
  "questionType" "QuizQuestionType" NOT NULL,
  "options" JSONB,
  "correctAnswer" TEXT,
  "points" SMALLINT NOT NULL DEFAULT 1,
  "orderIndex" SMALLINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quiz_questions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "course_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_quiz_question_content_order" ON "quiz_questions"("contentId", "orderIndex");

CREATE TABLE IF NOT EXISTS "quiz_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "contentId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "attemptNumber" SMALLINT NOT NULL,
  "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "answers" JSONB NOT NULL,
  "score" DECIMAL(8,2),
  "maxScore" DECIMAL(8,2),
  "feedback" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "gradedAt" TIMESTAMP(3),
  CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_quiz_attempt_content_student_number" UNIQUE ("contentId", "studentId", "attemptNumber"),
  CONSTRAINT "quiz_attempts_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "course_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "quiz_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_quiz_attempt_student_status" ON "quiz_attempts"("studentId", "status");
