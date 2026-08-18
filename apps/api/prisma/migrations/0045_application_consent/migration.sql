CREATE TYPE "ApplicationConsentType" AS ENUM ('TERMS', 'PRIVACY_NOTICE', 'NIN_PROCESSING', 'SUPPORT_CONTACT');

CREATE TABLE "application_consents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "consentType" "ApplicationConsentType" NOT NULL,
  "version" VARCHAR(50) NOT NULL,
  "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidence" JSONB,
  CONSTRAINT "application_consents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_consents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_application_consent_version" ON "application_consents"("applicationId", "consentType", "version");
CREATE INDEX "idx_application_consent" ON "application_consents"("applicationId", "consentType");
