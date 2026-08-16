-- Admissions Domain V5
-- Normalizes applicant identity/qualifications/documents/screening while preserving
-- the existing Applicant compatibility record. Designed to run after the existing
-- UniPortal baseline migrations.

ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'DOCUMENT_REVIEW';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'ELIGIBLE';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'INELIGIBLE';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'WAITLISTED';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'DEFERRED';
ALTER TYPE "ApplicantStatus" ADD VALUE IF NOT EXISTS 'CLEARANCE';

CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT','SUBMITTED','UNDER_SCREENING','DOCUMENT_REVIEW','REVIEW_REQUIRED','ELIGIBLE','INELIGIBLE','DECISION_PENDING','OFFERED','WAITLISTED','ACCEPTED','DECLINED','REJECTED','WITHDRAWN','DEFERRED','CLEARANCE','MATRICULATED');
CREATE TYPE "ApplicationPaymentStatus" AS ENUM ('NOT_REQUIRED','PENDING','PAID','FAILED','REFUNDED','WAIVED');
CREATE TYPE "AddressType" AS ENUM ('RESIDENTIAL','PERMANENT');
CREATE TYPE "OLevelExamType" AS ENUM ('WAEC','NECO','NABTEB','GCE');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING','UNDER_REVIEW','VERIFIED','REJECTED');
CREATE TYPE "ApplicationDocumentType" AS ENUM ('PASSPORT_PHOTO','BIRTH_CERTIFICATE','AGE_DECLARATION','JAMB_RESULT','OLEVEL_RESULT','OLEVEL_CERTIFICATE','DE_CERTIFICATE','TRANSCRIPT','DEGREE_CERTIFICATE','NYSC_CERTIFICATE','REFERENCE','RESEARCH_PROPOSAL','PASSPORT','ID_CARD','OTHER');
CREATE TYPE "ScreeningResult" AS ENUM ('ELIGIBLE','INELIGIBLE','REVIEW_REQUIRED','INCOMPLETE');
CREATE TYPE "AdmissionDecisionType" AS ENUM ('OFFER','WAITLIST','REJECT','DEFER');
CREATE TYPE "AdmissionDecisionReason" AS ENUM ('ACADEMIC_REQUIREMENT_NOT_MET','DOCUMENT_NOT_VERIFIED','UTME_REQUIREMENT_NOT_MET','OLEVEL_REQUIREMENT_NOT_MET','PROGRAMME_CAPACITY','INCOMPLETE_APPLICATION','DUPLICATE_APPLICATION','INELIGIBLE_ADMISSION_TYPE','OTHER');
CREATE TYPE "OfferStatus" AS ENUM ('PENDING','ACCEPTED','DECLINED','EXPIRED','REVOKED');

CREATE TABLE IF NOT EXISTS "persons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  "middleName" VARCHAR(100),
  "dateOfBirth" DATE NOT NULL,
  "gender" VARCHAR(30) NOT NULL,
  "nationality" VARCHAR(100) NOT NULL,
  "stateOfOrigin" VARCHAR(100),
  "lga" VARCHAR(100),
  "primaryEmail" VARCHAR(255),
  "primaryPhone" VARCHAR(30),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_person_email" ON "persons"("primaryEmail");

ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "personId" UUID;
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "programmeChoice3Id" UUID;
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "residentialAddress" JSONB;
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "permanentAddress" JSONB;
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "guardianProfile" JSONB;
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "emergencyContact" JSONB;
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "declarationAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "applicants" ADD COLUMN IF NOT EXISTS "declarationAcceptedAt" TIMESTAMP(3);
DROP INDEX IF EXISTS "applicants_email_key";
DROP INDEX IF EXISTS "applicants_jambRegNo_key";
CREATE INDEX IF NOT EXISTS "idx_applicants_person" ON "applicants"("personId");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_applicant_cycle_email" ON "applicants"("admissionCycleId","email");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_applicant_cycle_jamb" ON "applicants"("admissionCycleId","jambRegNo");
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_programmeChoice3Id_fkey" FOREIGN KEY ("programmeChoice3Id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicantId" UUID NOT NULL,
  "admissionCycleId" UUID NOT NULL,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "completionPercent" SMALLINT NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3),
  "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentStatus" "ApplicationPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "submissionIdempotencyKey" VARCHAR(100),
  "declarationAccepted" BOOLEAN NOT NULL DEFAULT false,
  "declarationAcceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applications_applicantId_key" UNIQUE ("applicantId"),
  CONSTRAINT "applications_submissionIdempotencyKey_key" UNIQUE ("submissionIdempotencyKey"),
  CONSTRAINT "applications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "applications_admissionCycleId_fkey" FOREIGN KEY ("admissionCycleId") REFERENCES "admission_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_application_cycle_status" ON "applications"("admissionCycleId","status");

CREATE TABLE IF NOT EXISTS "applicant_addresses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicantId" UUID NOT NULL, "type" "AddressType" NOT NULL,
  "line1" VARCHAR(255) NOT NULL, "line2" VARCHAR(255), "city" VARCHAR(100), "lga" VARCHAR(100), "state" VARCHAR(100), "country" VARCHAR(100) NOT NULL DEFAULT 'Nigeria', "isPrimary" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "applicant_addresses_pkey" PRIMARY KEY ("id"), CONSTRAINT "uq_applicant_address_type" UNIQUE ("applicantId","type"), CONSTRAINT "applicant_addresses_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "applicant_guardians" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicantId" UUID NOT NULL, "fullName" VARCHAR(200) NOT NULL, "relationship" VARCHAR(80) NOT NULL, "phone" VARCHAR(30) NOT NULL, "email" VARCHAR(255), "occupation" VARCHAR(150), "address" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "applicant_guardians_pkey" PRIMARY KEY ("id"), CONSTRAINT "applicant_guardians_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_guardian_applicant" ON "applicant_guardians"("applicantId");

CREATE TABLE IF NOT EXISTS "applicant_emergency_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicantId" UUID NOT NULL, "fullName" VARCHAR(200) NOT NULL, "relationship" VARCHAR(80) NOT NULL, "phone" VARCHAR(30) NOT NULL, "email" VARCHAR(255), "address" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "applicant_emergency_contacts_pkey" PRIMARY KEY ("id"), CONSTRAINT "applicant_emergency_contacts_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_emergency_applicant" ON "applicant_emergency_contacts"("applicantId");

CREATE TABLE IF NOT EXISTS "previous_education" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicationId" UUID NOT NULL, "institution" VARCHAR(255) NOT NULL, "qualification" VARCHAR(150) NOT NULL, "programme" VARCHAR(255), "startYear" SMALLINT, "endYear" SMALLINT, "gradeOrCgpa" VARCHAR(50), "certificateNo" VARCHAR(100), "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING', "verifiedAt" TIMESTAMP(3), "verifiedById" UUID, "remarks" TEXT,
  CONSTRAINT "previous_education_pkey" PRIMARY KEY ("id"), CONSTRAINT "previous_education_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_prev_education" ON "previous_education"("applicationId","verificationStatus");

CREATE TABLE IF NOT EXISTS "olevel_sittings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicationId" UUID NOT NULL, "examType" "OLevelExamType" NOT NULL, "examYear" SMALLINT NOT NULL, "candidateNumber" VARCHAR(50), "examinationNumber" VARCHAR(50), "centreNumber" VARCHAR(50), "sittingNumber" SMALLINT NOT NULL, "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING', "verifiedAt" TIMESTAMP(3), "verifiedById" UUID, "verificationRef" VARCHAR(100), "remarks" TEXT,
  CONSTRAINT "olevel_sittings_pkey" PRIMARY KEY ("id"), CONSTRAINT "uq_olevel_app_sitting" UNIQUE ("applicationId","sittingNumber"), CONSTRAINT "olevel_sittings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "olevel_subjects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "sittingId" UUID NOT NULL, "subject" VARCHAR(100) NOT NULL, "grade" VARCHAR(5) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "olevel_subjects_pkey" PRIMARY KEY ("id"), CONSTRAINT "uq_olevel_subject" UNIQUE ("sittingId","subject"), CONSTRAINT "olevel_subjects_sittingId_fkey" FOREIGN KEY ("sittingId") REFERENCES "olevel_sittings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "application_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicationId" UUID NOT NULL, "documentType" "ApplicationDocumentType" NOT NULL, "fileUrl" VARCHAR(1000), "originalFileName" VARCHAR(255), "mimeType" VARCHAR(100), "sizeBytes" INTEGER, "documentNumber" VARCHAR(100), "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING', "rejectionReason" TEXT, "verifiedAt" TIMESTAMP(3), "verifiedById" UUID, "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id"), CONSTRAINT "application_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_app_documents" ON "application_documents"("applicationId","documentType");

CREATE TABLE IF NOT EXISTS "admission_screenings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicationId" UUID NOT NULL, "programmeId" UUID NOT NULL, "result" "ScreeningResult" NOT NULL, "score" DECIMAL(8,2), "reasons" JSONB NOT NULL, "policySnapshot" JSONB NOT NULL, "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "screenedById" UUID,
  CONSTRAINT "admission_screenings_pkey" PRIMARY KEY ("id"), CONSTRAINT "admission_screenings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "admission_screenings_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_screening_app" ON "admission_screenings"("applicationId","screenedAt");

CREATE TABLE IF NOT EXISTS "admission_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicationId" UUID NOT NULL, "decision" "AdmissionDecisionType" NOT NULL, "reasonCode" "AdmissionDecisionReason", "reason" TEXT, "decisionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decisionById" UUID, "approvedById" UUID,
  CONSTRAINT "admission_decisions_pkey" PRIMARY KEY ("id"), CONSTRAINT "admission_decisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_admission_decision" ON "admission_decisions"("applicationId","decisionDate");

CREATE TABLE IF NOT EXISTS "admission_offers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "applicationId" UUID NOT NULL, "offerNumber" VARCHAR(50) NOT NULL, "programmeId" UUID NOT NULL, "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiryDate" TIMESTAMP(3), "conditions" JSONB, "status" "OfferStatus" NOT NULL DEFAULT 'PENDING', "acceptedAt" TIMESTAMP(3), "declinedAt" TIMESTAMP(3),
  CONSTRAINT "admission_offers_pkey" PRIMARY KEY ("id"), CONSTRAINT "admission_offers_offerNumber_key" UNIQUE ("offerNumber"), CONSTRAINT "admission_offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "admission_offers_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_offer_app" ON "admission_offers"("applicationId","status");

CREATE TABLE IF NOT EXISTS "admission_requirements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "programmeId" UUID NOT NULL, "admissionType" "AdmissionType" NOT NULL, "academicYear" VARCHAR(9) NOT NULL, "minUtmeScore" SMALLINT, "minOLevelCredits" SMALLINT DEFAULT 5, "maxOLevelSittings" SMALLINT DEFAULT 2, "requireEnglish" BOOLEAN NOT NULL DEFAULT true, "requireMathematics" BOOLEAN NOT NULL DEFAULT true, "minAge" SMALLINT, "maxAge" SMALLINT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admission_requirements_pkey" PRIMARY KEY ("id"), CONSTRAINT "uq_admission_requirement" UNIQUE ("programmeId","admissionType","academicYear"), CONSTRAINT "admission_requirements_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "admission_subject_requirements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "requirementId" UUID NOT NULL, "subject" VARCHAR(100) NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true, "alternatives" JSONB,
  CONSTRAINT "admission_subject_requirements_pkey" PRIMARY KEY ("id"), CONSTRAINT "uq_admission_subject_requirement" UNIQUE ("requirementId","subject"), CONSTRAINT "admission_subject_requirements_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "admission_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
