-- Admissions Reference Data V6
-- Controlled global locations + examination authorities/types + subjects.

CREATE TABLE "ref_countries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "iso2" varchar(2) NOT NULL,
  "iso3" varchar(3),
  "numericCode" varchar(3),
  "name" varchar(150) NOT NULL,
  "officialName" varchar(255),
  "nationalityName" varchar(150),
  "phoneCode" varchar(10),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "ref_countries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ref_countries_iso2_key" ON "ref_countries"("iso2");
CREATE UNIQUE INDEX "ref_countries_iso3_key" ON "ref_countries"("iso3");
CREATE INDEX "idx_country_name" ON "ref_countries"("name");

CREATE TABLE "ref_administrative_divisions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "countryId" uuid NOT NULL,
  "parentId" uuid,
  "code" varchar(20),
  "name" varchar(150) NOT NULL,
  "type" varchar(50) NOT NULL,
  "level" smallint NOT NULL DEFAULT 1,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "ref_administrative_divisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ref_administrative_divisions_country_fkey" FOREIGN KEY ("countryId") REFERENCES "ref_countries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ref_administrative_divisions_parent_fkey" FOREIGN KEY ("parentId") REFERENCES "ref_administrative_divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_ref_division_country_code" ON "ref_administrative_divisions"("countryId","code");
CREATE UNIQUE INDEX "uq_ref_division_parent_name" ON "ref_administrative_divisions"("countryId","parentId","name");
CREATE INDEX "idx_ref_division_country_level" ON "ref_administrative_divisions"("countryId","level","name");
CREATE INDEX "idx_ref_division_parent" ON "ref_administrative_divisions"("parentId","name");

CREATE TABLE "ref_examination_authorities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" varchar(30) NOT NULL,
  "name" varchar(200) NOT NULL,
  "countryId" uuid,
  "description" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "ref_examination_authorities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ref_examination_authorities_country_fkey" FOREIGN KEY ("countryId") REFERENCES "ref_countries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ref_examination_authorities_code_key" ON "ref_examination_authorities"("code");
CREATE UNIQUE INDEX "ref_examination_authorities_name_key" ON "ref_examination_authorities"("name");
CREATE INDEX "idx_exam_authority_country" ON "ref_examination_authorities"("countryId");

CREATE TABLE "ref_examination_types" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "authorityId" uuid NOT NULL,
  "code" varchar(50) NOT NULL,
  "name" varchar(200) NOT NULL,
  "candidateLabel" varchar(100),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "ref_examination_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ref_examination_types_authority_fkey" FOREIGN KEY ("authorityId") REFERENCES "ref_examination_authorities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_exam_type_authority_code" ON "ref_examination_types"("authorityId","code");
CREATE INDEX "idx_exam_type_authority" ON "ref_examination_types"("authorityId","name");

CREATE TABLE "ref_academic_subjects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" varchar(30) NOT NULL,
  "name" varchar(150) NOT NULL,
  "category" varchar(80),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "ref_academic_subjects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ref_academic_subjects_code_key" ON "ref_academic_subjects"("code");
CREATE UNIQUE INDEX "ref_academic_subjects_name_key" ON "ref_academic_subjects"("name");
CREATE INDEX "idx_subject_category" ON "ref_academic_subjects"("category","name");

ALTER TABLE "applicants" ADD COLUMN "countryOfOriginId" uuid;
ALTER TABLE "applicants" ADD COLUMN "stateOfOriginId" uuid;
ALTER TABLE "applicants" ADD COLUMN "lgaOfOriginId" uuid;
ALTER TABLE "persons" ADD COLUMN "countryOfOriginId" uuid;
ALTER TABLE "persons" ADD COLUMN "stateOfOriginId" uuid;
ALTER TABLE "persons" ADD COLUMN "lgaOfOriginId" uuid;
ALTER TABLE "applicant_addresses" ADD COLUMN "countryId" uuid;
ALTER TABLE "applicant_addresses" ADD COLUMN "regionId" uuid;
ALTER TABLE "applicant_addresses" ADD COLUMN "localAreaId" uuid;
ALTER TABLE "olevel_sittings" ADD COLUMN "examinationAuthorityId" uuid;
ALTER TABLE "olevel_sittings" ADD COLUMN "examinationTypeId" uuid;
ALTER TABLE "olevel_sittings" ADD COLUMN "candidateCategory" varchar(50);

ALTER TABLE "applicants" ADD CONSTRAINT "applicants_country_origin_fkey" FOREIGN KEY ("countryOfOriginId") REFERENCES "ref_countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_state_origin_fkey" FOREIGN KEY ("stateOfOriginId") REFERENCES "ref_administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_lga_origin_fkey" FOREIGN KEY ("lgaOfOriginId") REFERENCES "ref_administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "persons" ADD CONSTRAINT "persons_country_origin_fkey" FOREIGN KEY ("countryOfOriginId") REFERENCES "ref_countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "persons" ADD CONSTRAINT "persons_state_origin_fkey" FOREIGN KEY ("stateOfOriginId") REFERENCES "ref_administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "persons" ADD CONSTRAINT "persons_lga_origin_fkey" FOREIGN KEY ("lgaOfOriginId") REFERENCES "ref_administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applicant_addresses" ADD CONSTRAINT "addresses_country_fkey" FOREIGN KEY ("countryId") REFERENCES "ref_countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applicant_addresses" ADD CONSTRAINT "addresses_region_fkey" FOREIGN KEY ("regionId") REFERENCES "ref_administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applicant_addresses" ADD CONSTRAINT "addresses_local_area_fkey" FOREIGN KEY ("localAreaId") REFERENCES "ref_administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "olevel_sittings" ADD CONSTRAINT "olevel_authority_fkey" FOREIGN KEY ("examinationAuthorityId") REFERENCES "ref_examination_authorities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "olevel_sittings" ADD CONSTRAINT "olevel_type_fkey" FOREIGN KEY ("examinationTypeId") REFERENCES "ref_examination_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_applicant_origin_location" ON "applicants"("countryOfOriginId","stateOfOriginId","lgaOfOriginId");
CREATE INDEX "idx_person_origin_location" ON "persons"("countryOfOriginId","stateOfOriginId","lgaOfOriginId");
CREATE INDEX "idx_address_reference_location" ON "applicant_addresses"("countryId","regionId","localAreaId");
CREATE INDEX "idx_olevel_exam_refs" ON "olevel_sittings"("examinationAuthorityId","examinationTypeId");
