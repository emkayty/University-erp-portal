-- V18: Normalize secondary-school examination authorities/types.
-- Additive migration: does not rewrite or delete applicant result history.
--
-- The application should treat examination authority and examination type as
-- reference data. Existing enum values remain supported for historical rows.
--
-- This migration is intentionally non-destructive because production institutions
-- may already have applicant records using legacy enum values.

CREATE TABLE IF NOT EXISTS "OLevelExamAuthority" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'NG',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OLevelExamAuthority_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OLevelExamAuthority_code_key"
  ON "OLevelExamAuthority"("code");

CREATE TABLE IF NOT EXISTS "OLevelExamAuthorityType" (
  "id" TEXT NOT NULL,
  "authorityId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OLevelExamAuthorityType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OLevelExamAuthorityType_authorityId_fkey"
    FOREIGN KEY ("authorityId") REFERENCES "OLevelExamAuthority"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OLevelExamAuthorityType_authority_code_key"
  ON "OLevelExamAuthorityType"("authorityId","code");

INSERT INTO "OLevelExamAuthority"
  ("id","code","name","shortName","countryCode","active","sortOrder","updatedAt")
VALUES
  ('olevel-auth-waec','WAEC','West African Examinations Council','WAEC','NG',TRUE,10,CURRENT_TIMESTAMP),
  ('olevel-auth-neco','NECO','National Examinations Council','NECO','NG',TRUE,20,CURRENT_TIMESTAMP),
  ('olevel-auth-nabteb','NABTEB','National Business and Technical Examinations Board','NABTEB','NG',TRUE,30,CURRENT_TIMESTAMP),
  ('olevel-auth-nbais','NBAIS','National Board for Arabic and Islamic Studies','NBAIS','NG',TRUE,40,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name"=EXCLUDED."name",
  "shortName"=EXCLUDED."shortName",
  "active"=EXCLUDED."active",
  "updatedAt"=CURRENT_TIMESTAMP;

INSERT INTO "OLevelExamAuthorityType"
  ("id","authorityId","code","name","active","sortOrder","updatedAt")
VALUES
  ('olevel-type-waec-internal','olevel-auth-waec','INTERNAL','WASSCE Internal / School Candidate',TRUE,10,CURRENT_TIMESTAMP),
  ('olevel-type-waec-external','olevel-auth-waec','EXTERNAL','WASSCE External / Private Candidate',TRUE,20,CURRENT_TIMESTAMP),
  ('olevel-type-neco-internal','olevel-auth-neco','INTERNAL','NECO SSCE Internal / School Candidate',TRUE,10,CURRENT_TIMESTAMP),
  ('olevel-type-neco-external','olevel-auth-neco','EXTERNAL','NECO SSCE External / Private Candidate',TRUE,20,CURRENT_TIMESTAMP),
  ('olevel-type-nabteb','olevel-auth-nabteb','CERTIFICATE','NABTEB certificate examination',TRUE,10,CURRENT_TIMESTAMP),
  ('olevel-type-nbais-saissce-internal','olevel-auth-nbais','SAISSCE_INTERNAL','SAISSCE Internal / June-July',TRUE,10,CURRENT_TIMESTAMP),
  ('olevel-type-nbais-saissce-external','olevel-auth-nbais','SAISSCE_EXTERNAL','SAISSCE External / November-December',TRUE,20,CURRENT_TIMESTAMP),
  ('olevel-type-nbais-science','olevel-auth-nbais','SCIENCE','NBAIS Science curriculum examination',TRUE,30,CURRENT_TIMESTAMP),
  ('olevel-type-nbais-tahfeez','olevel-auth-nbais','TAHFEEZ','NBAIS Tahfeez examination/certificate',FALSE,40,CURRENT_TIMESTAMP)
ON CONFLICT ("authorityId","code") DO UPDATE SET
  "name"=EXCLUDED."name",
  "active"=EXCLUDED."active",
  "sortOrder"=EXCLUDED."sortOrder",
  "updatedAt"=CURRENT_TIMESTAMP;
